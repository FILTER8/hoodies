const characters = [
  { name: "Collector", image: "/collector.png" },
  { name: "Flipper", image: "/flipper.png" },
  { name: "HODLer", image: "/hodler.png" },
  { name: "Builder", image: "/builder.png" },
];

export default function Home() {
  return (
    <main className="bg-[#ccff00] text-black">
      <header className="fixed left-6 right-6 top-6 z-50 flex justify-between text-xs md:text-sm">
        <div className="tracking-[0.28em]">HOODIES</div>

        <a
          href="https://x.com/OnChainHoodies"
          target="_blank"
          rel="noreferrer"
          className="bg-[#ccff00] text-black transition-colors duration-200 hover:bg-black hover:text-[#ccff00]"
        >
          @OnChainHoodies
        </a>
      </header>

      <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-24 text-center">
        <img
          src="/onchainhoodies.gif"
          alt="OnChainHoodies animated pixel character"
          className="image-render-pixel mb-10 w-[240px] md:w-[360px]"
        />

        <h1 className="mb-8 text-6xl leading-none md:text-8xl">
          OnChain
          <br />
          HOODIES
        </h1>

        <p className="max-w-2xl text-lg leading-relaxed opacity-75 md:text-2xl">
          The fully on-chain neighborhood of Web3.
          <br />
          1-bit. Hand-drawn. Fully on-chain.
        </p>

        <a
          href="#collection"
          className="mt-20 bg-[#ccff00] text-xs uppercase tracking-[0.35em] text-black transition-colors duration-200 hover:bg-black hover:text-[#ccff00]"
        >
          scroll
          <br />↓
        </a>
      </section>

      <section
        id="collection"
        className="flex min-h-screen flex-col items-center justify-center bg-black px-6 py-24 text-center text-[#ccff00]"
      >
        <p className="mb-10 text-sm uppercase tracking-[0.24em] md:text-base md:tracking-[0.28em]">
          Collection info
        </p>

        <h2 className="mb-8 text-5xl leading-none md:text-7xl">
          A hood for
          <br />
          Web3 people.
        </h2>

        <p className="mb-14 max-w-2xl text-lg leading-relaxed md:text-2xl">
          OnChainHoodies is a fully on-chain NFT collection celebrating the
          people of Web3. We got 4 characters: Collectors, Flippers, HODLers
          and Builders.
          <br />
          <br />
          Who are you?
        </p>

        <div className="grid w-full max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
          {characters.map((character) => (
            <div
              key={character.name}
              className="group relative aspect-square overflow-hidden border border-[#ccff00] bg-[#ccff00]"
            >
              <img
                src={character.image}
                alt={character.name}
                className="image-render-pixel h-full w-full object-cover transition duration-300 group-hover:opacity-0"
              />

              <div className="absolute inset-0 flex items-center justify-center bg-black opacity-0 transition duration-300 group-hover:opacity-100">
                <p className="text-xl uppercase tracking-[0.18em] text-[#ccff00] md:text-2xl">
                  {character.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        id="hoodie-cam"
        className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center"
      >
        <p className="mb-10 text-sm uppercase tracking-[0.24em] md:text-base md:tracking-[0.28em]">
          Hoodie Cam
        </p>

        <h2 className="mb-8 text-5xl leading-none md:text-7xl">
          What&apos;s up
          <br />
          in your hood?
        </h2>

        <p className="mb-14 max-w-3xl text-lg leading-relaxed md:text-2xl">
          Capture your neighborhood in Hoodie style.
          <br />
          Turn your world into 1-bit black & green.
          <br />
          Share what&apos;s happening in your hood.
        </p>

        <div className="mb-14 grid w-full max-w-6xl gap-5 md:grid-cols-3">
          <div className="aspect-square overflow-hidden border-2 border-black bg-black">
            <img
              src="/hood-1.png"
              alt="Neighborhood inspiration 1"
              className="image-render-pixel h-full w-full object-cover"
            />
          </div>

          <div className="aspect-square overflow-hidden border-2 border-black bg-black">
            <img
              src="/hood-2.png"
              alt="Neighborhood inspiration 2"
              className="image-render-pixel h-full w-full object-cover"
            />
          </div>

          <div className="aspect-square overflow-hidden border-2 border-black bg-black">
            <img
              src="/hood-3.png"
              alt="Neighborhood inspiration 3"
              className="image-render-pixel h-full w-full object-cover"
            />
          </div>
        </div>

        <a
          href="/cam"
          className="border-2 border-black bg-[#ccff00] px-8 py-4 text-sm uppercase tracking-[0.22em] text-black transition-colors duration-200 hover:bg-black hover:text-[#ccff00]"
        >
          Open Hoodie Cam
        </a>
      </section>

      <section
        id="mint"
        className="flex min-h-screen flex-col items-center justify-center bg-black px-6 py-24 text-center text-[#ccff00]"
      >
        <p className="mb-10 text-sm uppercase tracking-[0.24em] md:text-base md:tracking-[0.28em]">
          Mint
        </p>

        <h2 className="mb-8 text-5xl leading-none md:text-7xl">
          Open mint.
          <br />
          Details TBA.
        </h2>

        <div className="mb-12 grid gap-4 text-sm uppercase tracking-[0.22em] md:grid-cols-3">
          <div>Supply TBA</div>
          <div>Mint date TBA</div>
          <div>Robinhood Chain</div>
        </div>

        <a
          href="https://mintbay.xyz"
          target="_blank"
          rel="noreferrer"
          className="border-2 border-[#ccff00] bg-black px-8 py-4 text-sm uppercase tracking-[0.22em] text-[#ccff00] transition-colors duration-200 hover:bg-[#ccff00] hover:text-black"
        >
          Minting platform: mintbay.xyz
        </a>
      </section>

      <footer className="flex justify-between px-6 py-8 text-xs uppercase tracking-[0.28em]">
        <div>HOODIES</div>
        <div>Fully on-chain</div>
      </footer>
    </main>
  );
}