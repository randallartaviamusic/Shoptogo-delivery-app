import { Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, Flame } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Link to="/" className="mb-10">
        <Wordmark />
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex flex-col items-center"
      >
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Flame className="size-7" />
        </span>
        <h1 className="mt-6 font-display text-6xl font-extrabold tracking-tight">
          404
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Este antojo no existe o ya se lo llevaron. Volvé al inicio y seguí
          deslizando.
        </p>
        <Button asChild className="mt-6 gap-2 bg-ember-gradient text-black">
          <Link to="/">
            <ArrowLeft className="size-4" />
            Volver al inicio
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
