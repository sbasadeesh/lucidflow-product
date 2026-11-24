const KEY = "lucidflow-scan";

export function saveScan(scan) {
  sessionStorage.setItem(KEY, JSON.stringify(scan));
}

export function getScan() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}
