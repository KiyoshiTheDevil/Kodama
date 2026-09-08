// A fair shuffle.
//
// Three places did this with `[...list].sort(() => Math.random() - 0.5)`, which looks like a
// shuffle and is not one. A comparator has to answer consistently for the same pair, and a
// random one does not, so the sort is working from contradictory information; what comes out
// depends on the algorithm underneath and is nowhere near an even spread. In practice items
// stay close to where they started, which on a long playlist means the beginning of the list
// keeps turning up first - exactly the thing shuffling is supposed to prevent.
//
// Fisher-Yates instead: walk from the back, swap each item with a random one at or before it.
// Every ordering is equally likely, and it does not care how the engine sorts.
export function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
