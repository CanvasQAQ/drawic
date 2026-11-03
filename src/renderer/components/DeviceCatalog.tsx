import { Button } from "../ui";
import React from "react";
import type { DeviceLibraryRecord } from "../../core/library";

export type { CatalogSource as DeviceSource } from "../../core/deviceCatalog";
import type { CatalogSource as DeviceSource } from "../../core/deviceCatalog";
export interface BrowseEntry { record: DeviceLibraryRecord; source: DeviceSource }
const sources = { "built-in": "Built-in", custom: "Custom", project: "This project" };
const vectors = { north: [0,-1], east: [1,0], south: [0,1], west: [-1,0] } as const;

function DeviceCard({ entry, onEdit, onClone }: { entry: BrowseEntry;
  onEdit: (record: DeviceLibraryRecord) => void; onClone: (record: DeviceLibraryRecord) => void }) {
  const { record, source } = entry;
  const box = record.selectionBox ?? record.frame;
  const size = Math.max(box.width, box.height);
  const longestHorizontalPin = Math.max(0, ...record.pins.filter(pin => pin.direction === "east" || pin.direction === "west").map(pin => (pin.name || pin.id).length));
  const longestVerticalPin = Math.max(0, ...record.pins.filter(pin => pin.direction === "north" || pin.direction === "south").map(pin => (pin.name || pin.id).length));
  const paddingX = Math.max(26, Math.min(85, size * .12 + longestHorizontalPin * 5 + 18));
  const paddingY = Math.max(23, Math.min(65, size * .12 + longestVerticalPin * 5 + 18));
  const length = Math.max(12, Math.min(25, size * .15));
  const centerX = record.frame.x + record.frame.width / 2;
  const centerY = record.frame.y + record.frame.height / 2;
  return <article className="catalog-card" data-device-id={record.id}>
    <header><h3>{record.title}</h3><small>{sources[source]} · {record.category} · {record.pins.length} pins</small></header>
    <svg className="catalog-preview" viewBox={`${box.x-paddingX} ${box.y-paddingY} ${box.width+paddingX*2} ${box.height+paddingY*2}`}
      role="img" aria-label={`${record.title} pin directions`}>
      <rect className="catalog-selection-box" x={box.x} y={box.y} width={box.width} height={box.height}/>
      <g className="catalog-art" dangerouslySetInnerHTML={{__html:record.artwork.body}}/>
      {record.pins.map(pin => {
        const [dx,dy] = vectors[pin.direction];
        const x = centerX + pin.x, y = centerY + pin.y;
        const tipX = x + dx*length, tipY = y + dy*length;
        const wingX = -dy*2.5, wingY = dx*2.5;
        return <g key={pin.id} className="catalog-pin" data-pin-key={pin.key}>
          <title>{pin.name} · {pin.direction}</title>
          <path d={`M ${x} ${y} L ${tipX} ${tipY} M ${tipX-dx*5+wingX} ${tipY-dy*5+wingY} L ${tipX} ${tipY} L ${tipX-dx*5-wingX} ${tipY-dy*5-wingY}`}/>
          <circle cx={x} cy={y} r="2.5"/>
          <text x={tipX+dx*4} y={tipY+dy*4} textAnchor={dx>0?"start":dx<0?"end":"middle"} dominantBaseline="central">{pin.name || pin.id}</text>
        </g>;
      })}
    </svg>
    <footer>
      {source === "custom" && <Button type="button" onClick={() => onEdit(record)}>Edit</Button>}
      <Button type="button" onClick={() => onClone(record)}>Clone</Button>
    </footer>
  </article>;
}

export function DeviceCatalog({ entries, onEdit, onClone }: {
  entries: readonly BrowseEntry[];
  onEdit: (record: DeviceLibraryRecord) => void;
  onClone: (record: DeviceLibraryRecord) => void;
}) {
  if (!entries.length) return <p className="device-library-empty">No devices match the current filters.</p>;
  return <div className="device-catalog" aria-label="Matching devices">
    {entries.map(entry => <DeviceCard key={entry.record.id} entry={entry} onEdit={onEdit} onClone={onClone}/>)}
  </div>;
}
