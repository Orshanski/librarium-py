import { useLocation } from "react-router-dom";

export function usePathnameWithSearch(): string {
  const location = useLocation();
  return location.pathname + location.search;
}
