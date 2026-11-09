import { useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import { readPasswordRecoveryLink } from "../utils/password-recovery";
export function usePasswordRecoveryLink() {
  const [link, setLink] = useState<{
    token: string;
    portal: "APP" | "ADMIN";
  } | null>(null);
  useEffect(() => {
    function handle(raw: string | null | undefined) {
      const result = readPasswordRecoveryLink(raw);
      if (!result) return;
      setLink(result);
      if (Platform.OS === "web")
        window.history.replaceState(null, "", window.location.pathname);
    }
    if (Platform.OS === "web") {
      handle(window.location.href);
      const listener = () => handle(window.location.href);
      window.addEventListener("hashchange", listener);
      window.addEventListener("popstate", listener);
      return () => {
        window.removeEventListener("hashchange", listener);
        window.removeEventListener("popstate", listener);
      };
    }
    void Linking.getInitialURL()
      .then(handle)
      .catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, []);
  return { link, clear: () => setLink(null) };
}
