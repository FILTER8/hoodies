#!/usr/bin/env python3
"""
OnChainHoodies collection archiver + optional Cloudflare R2 uploader.

Fix included:
- Supports ERC-721 metadata using `image_data` instead of `image`.
- `image_data` may be:
  - a data:image/svg+xml;base64,... URI
  - a URL-encoded data URI
  - raw <svg>...</svg>
- Automatically loads .env and .env.local.
- Safely resumes completed tokens.
- Creates agent-friendly API JSON.
- Optionally uploads the archive to Cloudflare R2.

Local output
------------
public/hoodies/
  api/v1/collection.json
  api/v1/tokens.json
  api/v1/tokens/0.json
  images/0.svg
  raw-metadata/0.json
  records/0.json
  failures.json

Basic usage
-----------
python3 download_hoodies.py --count 10 --workers 2
python3 download_hoodies.py --count 6000 --workers 6

Optional R2 upload
------------------
pip3 install boto3
python3 download_hoodies.py --count 6000 --workers 6 --upload-r2
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import json
import mimetypes
import os
import random
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

TOKEN_URI_SELECTOR = "c87b56dd"
DEFAULT_TIMEOUT_SECONDS = 180
MAX_REMOTE_BYTES = 30 * 1024 * 1024
PRINT_LOCK = threading.Lock()

CONTENT_TYPES = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".json": "application/json; charset=utf-8",
}


@dataclass
class TokenRecord:
    token_id: int
    name: str
    description: str
    image_path: str
    metadata_path: str
    api_path: str
    image_type: str
    image_sha256: str
    attributes: list[dict[str, Any]]


def log(message: str) -> None:
    with PRINT_LOCK:
        print(message, flush=True)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text("utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            continue

        if (
            len(value) >= 2
            and value[0] == value[-1]
            and value[0] in {"'", '"'}
        ):
            value = value[1:-1]

        os.environ.setdefault(key, value)


def load_project_environment(script_path: Path) -> Path:
    candidates = [script_path.parent, Path.cwd()]

    for candidate in candidates:
        if (candidate / "package.json").exists():
            load_env_file(candidate / ".env")
            load_env_file(candidate / ".env.local")
            return candidate

    load_env_file(script_path.parent / ".env")
    load_env_file(script_path.parent / ".env.local")
    return script_path.parent


def is_address(value: str) -> bool:
    return re.fullmatch(r"0x[a-fA-F0-9]{40}", value) is not None


def encode_token_uri_call(token_id: int) -> str:
    return f"0x{TOKEN_URI_SELECTOR}{token_id:064x}"


def decode_abi_string(value: str) -> str:
    if not value.startswith("0x"):
        raise ValueError("RPC result is not hex encoded.")

    hex_data = value[2:]

    if len(hex_data) < 128:
        raise ValueError("tokenURI response is too short.")

    offset = int(hex_data[:64], 16)
    length_position = offset * 2

    if length_position + 64 > len(hex_data):
        raise ValueError("Invalid ABI string offset.")

    string_length = int(
        hex_data[length_position:length_position + 64],
        16,
    )

    data_start = length_position + 64
    data_end = data_start + string_length * 2

    if data_end > len(hex_data):
        raise ValueError("Invalid ABI string length.")

    return bytes.fromhex(hex_data[data_start:data_end]).decode("utf-8")


def normalize_ipfs(uri: str, gateway: str) -> str:
    if uri.startswith("ipfs://ipfs/"):
        return gateway.rstrip("/") + "/ipfs/" + uri[len("ipfs://ipfs/"):]

    if uri.startswith("ipfs://"):
        return gateway.rstrip("/") + "/ipfs/" + uri[len("ipfs://"):]

    return uri


def parse_data_uri(uri: str) -> tuple[str, bytes]:
    comma = uri.find(",")

    if not uri.startswith("data:") or comma == -1:
        raise ValueError("Malformed data URI.")

    header = uri[5:comma]
    payload = uri[comma + 1:]
    parts = header.split(";")

    media_type = parts[0] or "text/plain;charset=US-ASCII"
    is_base64 = "base64" in parts[1:]

    body = (
        base64.b64decode(payload)
        if is_base64
        else urllib.parse.unquote_to_bytes(payload)
    )

    return media_type, body


def request_bytes(
    url: str,
    *,
    method: str = "GET",
    body: Optional[bytes] = None,
    headers: Optional[dict[str, str]] = None,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = MAX_REMOTE_BYTES,
) -> tuple[bytes, str]:
    request = urllib.request.Request(
        url,
        data=body,
        headers=headers or {},
        method=method,
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        declared = response.headers.get("Content-Length")

        if declared and int(declared) > max_bytes:
            raise ValueError("Remote response is too large.")

        data = response.read(max_bytes + 1)

        if len(data) > max_bytes:
            raise ValueError("Remote response is too large.")

        return data, response.headers.get_content_type() or ""


def rpc_call(
    rpc_url: str,
    contract: str,
    token_id: int,
    timeout: int,
) -> str:
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": token_id,
            "method": "eth_call",
            "params": [
                {
                    "to": contract,
                    "data": encode_token_uri_call(token_id),
                },
                "latest",
            ],
        }
    ).encode("utf-8")

    response_body, _ = request_bytes(
        rpc_url,
        method="POST",
        body=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "OnChainHoodies-Archiver/2.1",
        },
        timeout=timeout,
    )

    response = json.loads(response_body.decode("utf-8"))

    if response.get("error"):
        message = response["error"].get("message", "Unknown JSON-RPC error")
        raise RuntimeError(message)

    result = response.get("result")

    if not isinstance(result, str) or not result:
        raise RuntimeError("tokenURI returned no data.")

    return decode_abi_string(result)


def read_json_uri(
    uri: str,
    ipfs_gateway: str,
    timeout: int,
) -> dict[str, Any]:
    if uri.startswith("data:"):
        _, body = parse_data_uri(uri)
    else:
        body, _ = request_bytes(
            normalize_ipfs(uri, ipfs_gateway),
            headers={
                "Accept": "application/json",
                "User-Agent": "OnChainHoodies-Archiver/2.1",
            },
            timeout=timeout,
        )

    parsed = json.loads(body.decode("utf-8"))

    if not isinstance(parsed, dict):
        raise ValueError("Token metadata is not a JSON object.")

    return parsed


def read_image_value(
    image_value: str,
    ipfs_gateway: str,
    timeout: int,
) -> tuple[str, bytes]:
    """
    Supports:
    - data:image/svg+xml;base64,...
    - data:image/svg+xml;utf8,...
    - raw <svg>...</svg>
    - ipfs://...
    - https://...
    """

    stripped = image_value.lstrip()

    if stripped.startswith("<svg"):
        return "image/svg+xml", image_value.encode("utf-8")

    if image_value.startswith("data:"):
        return parse_data_uri(image_value)

    body, content_type = request_bytes(
        normalize_ipfs(image_value, ipfs_gateway),
        headers={
            "Accept": "image/*,*/*;q=0.8",
            "User-Agent": "OnChainHoodies-Archiver/2.1",
        },
        timeout=timeout,
    )

    return content_type or "application/octet-stream", body


def extract_image_value(metadata: dict[str, Any]) -> str:
    """
    OnChainHoodies uses `image_data`.
    Fallbacks are retained for future compatibility.
    """

    for key in ("image_data", "image", "image_url"):
        value = metadata.get(key)

        if isinstance(value, str) and value.strip():
            return value

    raise ValueError(
        "Metadata does not contain image_data, image, or image_url."
    )


def extension_for_content(content_type: str, body: bytes) -> str:
    normalized = content_type.split(";", 1)[0].strip().lower()

    explicit = {
        "image/svg+xml": ".svg",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }

    if normalized in explicit:
        return explicit[normalized]

    if body.lstrip().startswith(b"<svg") or b"<svg" in body[:500]:
        return ".svg"

    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"

    if body.startswith(b"\xff\xd8\xff"):
        return ".jpg"

    if body.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"

    if body.startswith(b"RIFF") and body[8:12] == b"WEBP":
        return ".webp"

    return mimetypes.guess_extension(normalized) or ".bin"


def atomic_write(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(body)
    os.replace(temporary, path)


def atomic_write_json(
    path: Path,
    value: Any,
    *,
    pretty: bool = True,
) -> None:
    body = json.dumps(
        value,
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
    ).encode("utf-8")

    atomic_write(path, body)


def public_url(base_url: str, path: str) -> str:
    if not base_url:
        return "/" + path.lstrip("/")

    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def api_token_document(
    record: TokenRecord,
    contract: str,
    chain_name: str,
    public_base_url: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": "1.0",
        "collection": "OnChainHoodies",
        "chain": chain_name,
        "contract": contract,
        "tokenId": str(record.token_id),
        "name": record.name,
        "description": record.description,
        "image": public_url(public_base_url, record.image_path),
        "metadata": public_url(public_base_url, record.metadata_path),
        "attributes": record.attributes,
        "content": {
            "type": record.image_type,
            "sha256": record.image_sha256,
        },
    }


def load_existing_record(
    output_dir: Path,
    token_id: int,
) -> Optional[TokenRecord]:
    path = output_dir / "records" / f"{token_id}.json"

    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text("utf-8"))
        record = TokenRecord(**data)

        image_file = output_dir / record.image_path
        metadata_file = output_dir / record.metadata_path
        api_file = output_dir / record.api_path

        if image_file.exists() and metadata_file.exists() and api_file.exists():
            return record

    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        pass

    return None


def save_record(output_dir: Path, record: TokenRecord) -> None:
    atomic_write_json(
        output_dir / "records" / f"{record.token_id}.json",
        asdict(record),
    )


def download_token(
    token_id: int,
    *,
    rpc_url: str,
    contract: str,
    chain_name: str,
    output_dir: Path,
    public_base_url: str,
    ipfs_gateway: str,
    timeout: int,
    retries: int,
    overwrite: bool,
) -> TokenRecord:
    if not overwrite:
        existing = load_existing_record(output_dir, token_id)

        if existing is not None:
            return existing

    last_error: Optional[Exception] = None

    for attempt in range(retries + 1):
        try:
            token_uri = rpc_call(
                rpc_url,
                contract,
                token_id,
                timeout,
            )

            metadata = read_json_uri(
                token_uri,
                ipfs_gateway,
                timeout,
            )

            image_value = extract_image_value(metadata)

            image_type, image_body = read_image_value(
                image_value,
                ipfs_gateway,
                timeout,
            )

            extension = extension_for_content(
                image_type,
                image_body,
            )

            image_path = f"images/{token_id}{extension}"
            metadata_path = f"raw-metadata/{token_id}.json"
            api_path = f"api/v1/tokens/{token_id}.json"

            attributes = metadata.get("attributes")

            if not isinstance(attributes, list):
                attributes = []

            raw_metadata = dict(metadata)
            raw_metadata["tokenId"] = str(token_id)
            raw_metadata["archivedImage"] = public_url(
                public_base_url,
                image_path,
            )

            atomic_write(
                output_dir / image_path,
                image_body,
            )

            atomic_write_json(
                output_dir / metadata_path,
                raw_metadata,
            )

            record = TokenRecord(
                token_id=token_id,
                name=str(
                    metadata.get("name")
                    or f"OnChainHoodies #{token_id}"
                ),
                description=str(
                    metadata.get("description")
                    or ""
                ),
                image_path=image_path,
                metadata_path=metadata_path,
                api_path=api_path,
                image_type=image_type,
                image_sha256=hashlib.sha256(
                    image_body
                ).hexdigest(),
                attributes=attributes,
            )

            atomic_write_json(
                output_dir / api_path,
                api_token_document(
                    record,
                    contract,
                    chain_name,
                    public_base_url,
                ),
            )

            save_record(output_dir, record)
            return record

        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            OSError,
            ValueError,
            RuntimeError,
            json.JSONDecodeError,
        ) as error:
            last_error = error

            if attempt >= retries:
                break

            time.sleep(
                min(
                    30.0,
                    2**attempt + random.random(),
                )
            )

    raise RuntimeError(
        f"Token #{token_id}: {last_error}"
    )


def write_indexes(
    output_dir: Path,
    *,
    contract: str,
    chain_name: str,
    public_base_url: str,
    start: int,
    count: int,
    records: dict[int, TokenRecord],
    failures: dict[int, str],
) -> None:
    ordered = [
        records[token_id]
        for token_id in sorted(records)
    ]

    tokens = [
        api_token_document(
            record,
            contract,
            chain_name,
            public_base_url,
        )
        for record in ordered
    ]

    collection = {
        "schemaVersion": "1.0",
        "name": "OnChainHoodies",
        "description": (
            "A fully on-chain neighborhood for the people of Web3."
        ),
        "chain": chain_name,
        "contract": contract,
        "startTokenId": start,
        "requestedCount": count,
        "downloadedCount": len(ordered),
        "failedCount": len(failures),
        "generatedAt": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(),
        ),
        "endpoints": {
            "tokens": public_url(
                public_base_url,
                "api/v1/tokens.json",
            ),
            "token": public_url(
                public_base_url,
                "api/v1/tokens/{tokenId}.json",
            ),
        },
    }

    atomic_write_json(
        output_dir / "api/v1/collection.json",
        collection,
    )

    atomic_write_json(
        output_dir / "api/v1/tokens.json",
        tokens,
        pretty=False,
    )

    atomic_write_json(
        output_dir / "failures.json",
        {
            str(token_id): message
            for token_id, message in sorted(
                failures.items()
            )
        },
    )


def build_r2_client(args: argparse.Namespace):
    try:
        import boto3  # type: ignore
        from botocore.config import Config  # type: ignore
    except ImportError as error:
        raise RuntimeError(
            "R2 upload requires boto3. Run: pip3 install boto3"
        ) from error

    required = {
        "CLOUDFLARE_ACCOUNT_ID": args.r2_account_id,
        "R2_ACCESS_KEY_ID": args.r2_access_key_id,
        "R2_SECRET_ACCESS_KEY": args.r2_secret_access_key,
        "R2_BUCKET_NAME": args.r2_bucket,
    }

    missing = [
        name
        for name, value in required.items()
        if not value
    ]

    if missing:
        raise RuntimeError(
            "Missing R2 configuration: "
            + ", ".join(missing)
        )

    endpoint = (
        f"https://{args.r2_account_id}"
        ".r2.cloudflarestorage.com"
    )

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=args.r2_access_key_id,
        aws_secret_access_key=args.r2_secret_access_key,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            retries={
                "max_attempts": 10,
                "mode": "adaptive",
            },
        ),
    )


def upload_archive_to_r2(
    output_dir: Path,
    args: argparse.Namespace,
) -> None:
    client = build_r2_client(args)

    files = [
        path
        for path in output_dir.rglob("*")
        if path.is_file()
        and not path.name.endswith(".tmp")
        and "records" not in path.parts
    ]

    prefix = args.r2_prefix.strip("/")
    total = len(files)

    log("")
    log(
        f"Uploading {total} files "
        f"to R2 bucket {args.r2_bucket}..."
    )

    for index, path in enumerate(files, start=1):
        relative = path.relative_to(
            output_dir
        ).as_posix()

        key = (
            f"{prefix}/{relative}"
            if prefix
            else relative
        )

        suffix = path.suffix.lower()

        content_type = CONTENT_TYPES.get(
            suffix,
            mimetypes.guess_type(path.name)[0]
            or "application/octet-stream",
        )

        cache_control = (
            "public, max-age=300, s-maxage=300"
            if suffix == ".json"
            else "public, max-age=31536000, immutable"
        )

        client.upload_file(
            str(path),
            args.r2_bucket,
            key,
            ExtraArgs={
                "ContentType": content_type,
                "CacheControl": cache_control,
            },
        )

        log(
            f"[R2 {index:5d}/{total}] {key}"
        )


def parse_args(
    project_root: Path,
) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Archive OnChainHoodies and optionally "
            "upload to Cloudflare R2."
        )
    )

    parser.add_argument(
        "--rpc-url",
        default=os.getenv(
            "ALCHEMY_RPC_URL",
            "",
        ),
    )

    parser.add_argument(
        "--contract",
        default=os.getenv(
            "NEXT_PUBLIC_COLLECTION_ADDRESS",
            "",
        ),
    )

    parser.add_argument(
        "--chain-name",
        default=os.getenv(
            "NEXT_PUBLIC_CHAIN_NAME",
            "Robinhood Chain",
        ),
    )

    parser.add_argument(
        "--start",
        type=int,
        default=0,
    )

    parser.add_argument(
        "--count",
        type=int,
        default=6000,
    )

    parser.add_argument(
        "--workers",
        type=int,
        default=6,
    )

    parser.add_argument(
        "--retries",
        type=int,
        default=6,
    )

    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
    )

    parser.add_argument(
        "--output",
        default=str(
            project_root / "public" / "hoodies"
        ),
    )

    parser.add_argument(
        "--ipfs-gateway",
        default=os.getenv(
            "IPFS_GATEWAY_URL",
            "https://ipfs.io",
        ),
    )

    parser.add_argument(
        "--public-base-url",
        default=os.getenv(
            "R2_PUBLIC_BASE_URL",
            "",
        ),
    )

    parser.add_argument(
        "--overwrite",
        action="store_true",
    )

    parser.add_argument(
        "--upload-r2",
        action="store_true",
    )

    parser.add_argument(
        "--r2-account-id",
        default=os.getenv(
            "CLOUDFLARE_ACCOUNT_ID",
            "",
        ),
    )

    parser.add_argument(
        "--r2-access-key-id",
        default=os.getenv(
            "R2_ACCESS_KEY_ID",
            "",
        ),
    )

    parser.add_argument(
        "--r2-secret-access-key",
        default=os.getenv(
            "R2_SECRET_ACCESS_KEY",
            "",
        ),
    )

    parser.add_argument(
        "--r2-bucket",
        default=os.getenv(
            "R2_BUCKET_NAME",
            "",
        ),
    )

    parser.add_argument(
        "--r2-prefix",
        default=os.getenv(
            "R2_PREFIX",
            "hoodies",
        ),
    )

    return parser.parse_args()


def validate_args(
    args: argparse.Namespace,
) -> None:
    if not args.rpc_url:
        raise ValueError(
            "Missing ALCHEMY_RPC_URL in .env.local "
            "or --rpc-url."
        )

    if not is_address(args.contract):
        raise ValueError(
            "Missing or invalid "
            "NEXT_PUBLIC_COLLECTION_ADDRESS."
        )

    if args.start < 0:
        raise ValueError(
            "--start cannot be negative."
        )

    if args.count <= 0:
        raise ValueError(
            "--count must be greater than zero."
        )

    if args.workers <= 0:
        raise ValueError(
            "--workers must be greater than zero."
        )


def main() -> int:
    script_path = Path(__file__).resolve()
    project_root = load_project_environment(
        script_path
    )

    args = parse_args(project_root)

    try:
        validate_args(args)
    except ValueError as error:
        log(f"ERROR: {error}")
        return 2

    output_dir = Path(
        args.output
    ).resolve()

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    token_ids = list(
        range(
            args.start,
            args.start + args.count,
        )
    )

    records: dict[int, TokenRecord] = {}
    failures: dict[int, str] = {}

    log("OnChainHoodies archive v2.1")
    log(f"Project  : {project_root}")
    log(f"Contract : {args.contract}")
    log(
        f"Tokens   : {token_ids[0]} "
        f"through {token_ids[-1]}"
    )
    log(f"Output   : {output_dir}")
    log(f"Workers  : {args.workers}")
    log("")

    completed = 0
    started_at = time.time()

    with concurrent.futures.ThreadPoolExecutor(
        max_workers=args.workers
    ) as executor:
        future_to_token = {
            executor.submit(
                download_token,
                token_id,
                rpc_url=args.rpc_url,
                contract=args.contract,
                chain_name=args.chain_name,
                output_dir=output_dir,
                public_base_url=args.public_base_url,
                ipfs_gateway=args.ipfs_gateway,
                timeout=args.timeout,
                retries=args.retries,
                overwrite=args.overwrite,
            ): token_id
            for token_id in token_ids
        }

        for future in concurrent.futures.as_completed(
            future_to_token
        ):
            token_id = future_to_token[future]
            completed += 1

            try:
                record = future.result()
                records[token_id] = record
                status = "OK"

            except Exception as error:
                failures[token_id] = str(error)
                status = f"FAILED: {error}"

            elapsed = max(
                0.001,
                time.time() - started_at,
            )

            rate = completed / elapsed
            remaining = len(token_ids) - completed
            eta = int(
                remaining / rate
            ) if rate else 0

            log(
                f"[{completed:4d}/{len(token_ids)}] "
                f"#{token_id:<5d} {status} "
                f"| {rate:.2f}/s "
                f"| ETA {eta // 60}m {eta % 60}s"
            )

            if (
                completed % 25 == 0
                or completed == len(token_ids)
            ):
                write_indexes(
                    output_dir,
                    contract=args.contract,
                    chain_name=args.chain_name,
                    public_base_url=args.public_base_url,
                    start=args.start,
                    count=args.count,
                    records=records,
                    failures=failures,
                )

    write_indexes(
        output_dir,
        contract=args.contract,
        chain_name=args.chain_name,
        public_base_url=args.public_base_url,
        start=args.start,
        count=args.count,
        records=records,
        failures=failures,
    )

    log("")
    log(f"Downloaded: {len(records)}")
    log(f"Failed    : {len(failures)}")
    log(
        "API index : "
        f"{output_dir / 'api/v1/collection.json'}"
    )

    if args.upload_r2:
        try:
            upload_archive_to_r2(
                output_dir,
                args,
            )
        except Exception as error:
            log(
                f"R2 upload failed: {error}"
            )
            return 1

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
