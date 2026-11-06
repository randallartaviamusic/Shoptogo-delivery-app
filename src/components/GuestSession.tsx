import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

export const GUEST_CLAIM_KEY = "capricho:guest-claim";

/**
 * Capricho Express lets people swipe and buy without signing up. We open an
 * anonymous Convex Auth session in the background the first time they arrive,
 * so the cart, saved products and orders have somewhere real to live.
 */
export function GuestSession() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn } = useAuthActions();
  const issueClaim = useMutation(api.profiles.issueGuestClaim);
  const location = useLocation();
  const onAuthPage = location.pathname === "/auth";
  const [attempt, setAttempt] = useState(0);
  const signingIn = useRef(false);
  const retries = useRef(0);

  useEffect(() => {
    // While someone is turning their guest session into an account, don't
    // race them with a brand new anonymous session.
    if (isLoading || isAuthenticated || onAuthPage || signingIn.current) return;
    signingIn.current = true;
    signIn("anonymous")
      .then(() => {
        retries.current = 0;
      })
      .catch((error) => {
        console.error("[Capricho Express] Guest session failed:", error);
        if (retries.current < 2) {
          retries.current += 1;
          window.setTimeout(
            () => setAttempt((value) => value + 1),
            1200 * retries.current,
          );
        }
      })
      .finally(() => {
        signingIn.current = false;
      });
  }, [attempt, isAuthenticated, isLoading, onAuthPage, signIn]);

  useEffect(() => {
    if (!user?._id || !user.isAnonymous) return;
    let active = true;
    issueClaim()
      .then((token) => {
        if (active && token) window.localStorage.setItem(GUEST_CLAIM_KEY, token);
      })
      .catch((error) => {
        console.error("[Capricho Express] Guest claim failed:", error);
      });
    return () => {
      active = false;
    };
  }, [issueClaim, user?._id, user?.isAnonymous]);

  return null;
}
