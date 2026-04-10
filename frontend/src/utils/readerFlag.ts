import type { NavigateFunction } from "react-router-dom";

const KEY = "librarium_reading";

export function setReadingFlag(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // ignore
  }
}

export function clearReadingFlag(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function isReadingFlag(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function exitReader(navigate: NavigateFunction): void {
  clearReadingFlag();
  navigate(-1);
}
