import { motion, useReducedMotion } from "framer-motion";

/**
 * Distintivo visual de las cards de negocios Élite: borde dorado, resplandor
 * pulsante y un brillo que recorre la tarjeta. No altera el orden del
 * directorio ni del mazo.
 */
export function EliteAura() {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 border-2 border-amber-300/80 [border-radius:inherit]"
      />
    );
  }

  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 border-2 border-amber-300/80 [border-radius:inherit]"
        animate={{
          opacity: [0.55, 1, 0.55],
          boxShadow: [
            "0 0 0 1px rgba(251,191,36,0.18), 0 0 18px rgba(249,115,22,0.18)",
            "0 0 0 2px rgba(251,191,36,0.55), 0 0 40px rgba(249,115,22,0.5)",
            "0 0 0 1px rgba(251,191,36,0.18), 0 0 18px rgba(249,115,22,0.18)",
          ],
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden [border-radius:inherit]"
      >
        <motion.span
          className="absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(105deg,transparent,rgba(251,191,36,0.22),transparent)]"
          animate={{ x: ["-150%", "450%"] }}
          transition={{
            duration: 3.6,
            repeat: Infinity,
            ease: "easeInOut",
            repeatDelay: 1,
          }}
        />
      </motion.span>
    </>
  );
}
