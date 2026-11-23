import React from "react";
import { engine } from "./main";
// A data-only display device: geometry, text and controls are submitted by VM programs.
export default function ProgramDisplay({ s, w }) {
  const d = w.display,
    send = (id, data) => engine.event(s, w, id, data);
  return (
    <div
      className="program-display"
      style={{ background: d.background || "#f5f6ef" }}
    >
      <svg
        viewBox={`0 0 ${d.width || 640} ${d.height || 400}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label={d.title || w.title}
      >
        {(d.nodes || []).map((n, i) => {
          const color = n.color || "#647968";
          switch (n.type) {
            case "rect":
              return (
                <rect
                  key={i}
                  x={n.x}
                  y={n.y}
                  width={n.width}
                  height={n.height}
                  rx={n.radius || 0}
                  fill={color}
                />
              );
            case "line":
              return (
                <line
                  key={i}
                  x1={n.x}
                  y1={n.y}
                  x2={n.x2}
                  y2={n.y2}
                  stroke={color}
                  strokeWidth={n.strokeWidth || 1}
                />
              );
            case "circle":
              return (
                <circle key={i} cx={n.x} cy={n.y} r={n.radius} fill={color} />
              );
            case "text":
              return (
                <text
                  key={i}
                  x={n.x}
                  y={n.y}
                  fontSize={n.size || 16}
                  fill={color}
                  fontWeight={n.bold ? 600 : 400}
                >
                  {String(n.text ?? "")}
                </text>
              );
            case "button":
              return (
                <foreignObject
                  key={i}
                  x={n.x}
                  y={n.y}
                  width={n.width || 130}
                  height={n.height || 38}
                >
                  <button
                    data-testid={"program-control-" + n.id}
                    disabled={!engine.active(s)}
                    onClick={() => send(n.id, n.value)}
                  >
                    {n.label}
                  </button>
                </foreignObject>
              );
            case "input":
              return (
                <foreignObject
                  key={i}
                  x={n.x}
                  y={n.y}
                  width={n.width || 220}
                  height={n.height || 38}
                >
                  <input
                    data-testid={"program-control-" + n.id}
                    aria-label={n.label || n.id}
                    defaultValue={n.value || ""}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") send(n.id, e.currentTarget.value);
                    }}
                  />
                </foreignObject>
              );
            default:
              return null;
          }
        })}
      </svg>
      <small className="program-display-status">
        {s.id} · 由程序提交 · 版本 {w.displayVersion || 1}
      </small>
    </div>
  );
}
