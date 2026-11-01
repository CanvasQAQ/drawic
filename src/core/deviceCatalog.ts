import type { DeviceLibraryRecord, DeviceSymbol } from "./library";

export type CatalogSource = "built-in" | "custom" | "project";

export function catalogFilter(query: string, category: string, source: CatalogSource | "all") {
  const search = query.trim().toLowerCase();
  return (device: DeviceLibraryRecord | DeviceSymbol, origin: CatalogSource | undefined) => {
    if (source !== "all" && source !== origin) return false;
    if (category !== "all" && category !== device.category) return false;
    if (!search) return true;
    const fields = [
      device.id, "title" in device ? device.title : device.label, device.category,
      ...device.keywords, ...device.pins.flatMap(pin => [pin.key, pin.name, pin.role]),
    ];
    return fields.some(value => value.toLowerCase().includes(search));
  };
}
