import React, { useMemo, useState } from "react";
import { FilterSelect } from "./FilterSelect";

const geometry = "path,line,polyline,polygon,rect,circle,ellipse,text";
const attributes: Record<string, string[]> = {
  path: ["d"], line: ["x1", "y1", "x2", "y2"], polyline: ["points"], polygon: ["points"],
  rect: ["x", "y", "width", "height", "rx", "ry"], circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"], text: ["x", "y", "font-size", "text-anchor"],
};

function parse(body: string) {
  return new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, "image/svg+xml");
}

export function svgArtworkPreview(body: string, selected: number) {
  const document = parse(body);
  document.querySelectorAll(geometry).forEach((element, index) => {
    element.setAttribute("data-svg-element", String(index));
    if (index === selected || selected === -2) element.setAttribute("data-svg-selected", "true");
  });
  return document.documentElement.innerHTML;
}

export function SvgArtworkEditor({ body, selected, onSelect, onChange }: {
  body: string; selected: number; onSelect: (index: number) => void; onChange: (body: string) => void;
}) {
  const document = useMemo(() => parse(body), [body]);
  const elements = [...document.querySelectorAll(geometry)];
  const element = elements[selected];
  const [groupX, setGroupX] = useState(0);
  const [groupY, setGroupY] = useState(0);
  return <section className="svg-artwork-editor">
    <h3>SVG artwork</h3>
    <p>Choose a part or all artwork. Changes can be undone.</p>
    <FilterSelect label="Artwork element" value={String(selected)} onChange={value => onSelect(Number(value))}
      options={[{ value: "-1", label: "Choose an element" }, { value: "-2", label: "All artwork" }, ...elements.map((item, index) => ({ value: String(index), label: `${index + 1} · ${item.tagName}` }))]}/>
    {selected === -2 && <div className="svg-element-fields">
      <p>Move all SVG artwork on the 1-unit grid. Pins stay at their contact positions.</p>
      <label>Move X<input type="number" step="1" aria-label="Move all artwork X" value={groupX} onChange={event => setGroupX(Number(event.target.value))}/></label>
      <label>Move Y<input type="number" step="1" aria-label="Move all artwork Y" value={groupY} onChange={event => setGroupY(Number(event.target.value))}/></label>
      <button type="button" disabled={!groupX && !groupY} onClick={() => {
        const x = Math.round(groupX), y = Math.round(groupY);
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("transform", `translate(${x} ${y})`);
        while (document.documentElement.firstChild) group.appendChild(document.documentElement.firstChild);
        document.documentElement.appendChild(group);
        onChange(document.documentElement.innerHTML);
        setGroupX(0); setGroupY(0);
      }}>Move selected artwork</button>
    </div>}
    {element && <ElementFields key={`${selected}:${body}`} element={element} onApply={values => {
      for (const [name, value] of Object.entries(values)) {
        if (name === "text") element.textContent = value;
        else if (value.trim()) element.setAttribute(name, value.trim());
        else element.removeAttribute(name);
      }
      onChange(document.documentElement.innerHTML);
    }} onDelete={() => { element.remove(); onChange(document.documentElement.innerHTML); onSelect(-1); }}/>}
  </section>;
}

function ElementFields({ element, onApply, onDelete }: {
  element: Element; onApply: (values: Record<string, string>) => void; onDelete: () => void;
}) {
  const fields = [...(attributes[element.tagName] ?? []), "transform", "stroke-width", "stroke", "fill",
    ...(element.tagName === "text" ? ["text"] : [])];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(name =>
    [name, name === "text" ? element.textContent ?? "" : element.getAttribute(name) ?? ""])));
  const [error, setError] = useState("");
  const apply = () => {
    for (const [name, value] of Object.entries(values)) {
      if (!value.trim() || name === "text") continue;
      const valid = name === "d" ? /^[MmZzLlHhVvCcSsQqTtAa\d\s.,eE+\-]+$/.test(value) :
        name === "transform" ? /^(\s*(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([\d\s.,eE+\-]+\)\s*)+$/.test(value) :
        name === "stroke" || name === "fill" ? /^(?:none|currentColor|#[0-9a-f]{3,8})$/i.test(value) :
        name === "text-anchor" ? /^(start|middle|end)$/.test(value) :
        name === "points" ? /^[\d\s.,eE+\-]+$/.test(value) : Number.isFinite(Number(value));
      if (!valid) { setError(`Check ${name}. Use SVG coordinates or a local color value.`); return; }
    }
    onApply(values);
  };
  return <div className="svg-element-fields">
    {fields.map(name => <label key={name} className={["d", "points", "transform", "text"].includes(name) ? "is-wide" : undefined}>{name}<input aria-label={`SVG ${name}`} value={values[name]}
      onChange={event => { setValues({ ...values, [name]: event.target.value }); setError(""); }}/></label>)}
    <div><button type="button" onClick={apply}>Apply artwork changes</button><button type="button" onClick={onDelete}>Delete element</button></div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
