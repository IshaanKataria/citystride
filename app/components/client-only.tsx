import { useState, useEffect, type ReactNode } from "react";

interface ClientOnlyProps {
  readonly children: () => ReactNode;
  readonly fallback?: ReactNode;
}

export const ClientOnly = ({ children, fallback = null }: ClientOnlyProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children()}</>;
};
