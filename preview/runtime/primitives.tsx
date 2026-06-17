// preview/runtime/primitives.tsx — controles-folha do React Preview Runtime.
// Label / TextBox / EditBox / Button / CommandButton / CheckBox / ComboBox / Timer /
// Shape / Image / OptionGroup. Estilo SÓ por tokens; Win11/Fluent flat, grade de 8px.
// Eventos string -> handler via useFormEvent.
import type React from "react";
import { token } from "./theme";
import { useFormEvent } from "./context";

type Any = any;

const px = (v: Any): string | undefined =>
  v == null ? undefined : typeof v === "number" ? `${v}px` : String(v);

/** token de cor (nome do tema) ou literal (#hex/rgb) -> valor CSS. */
function colorValue(name?: string): string | undefined {
  if (!name) return undefined;
  if (/^#|^rgb|^hsl/i.test(name)) return name;
  return token(name);
}

const TEXT_ALIGN: Record<string, "left" | "center" | "right"> = {
  left: "left",
  center: "center",
  right: "right",
  auto: "left",
};

// ── Label ─────────────────────────────────────────────────────────────────────
export const Label = (props: Any) => {
  const p = props || {};
  const s: React.CSSProperties = {
    display: "inline-block",
    boxSizing: "border-box",
    fontFamily: token("font-body", "Segoe UI"),
    fontSize: p.fontSize != null ? px(p.fontSize) : "13px",
    fontWeight: p.bold ? 600 : 400,
    fontStyle: p.italic ? "italic" : "normal",
    color: colorValue(p.textColor) || token("onSurface"),
    lineHeight: 1.3,
  };
  if (p.width != null) s.width = px(p.width);
  if (p.height != null) {
    s.height = px(p.height);
    s.lineHeight = px(p.height);
  }
  if (p.textAlign) s.textAlign = TEXT_ALIGN[p.textAlign] || "left";
  if (!p.transparent && colorValue(p.color)) s.background = colorValue(p.color);
  if (p.alignSelf) s.alignSelf = p.alignSelf;
  return <span style={s}>{p.caption}</span>;
};

// ── TextBox / EditBox ──────────────────────────────────────────────────────────
function inputBase(p: Any): React.CSSProperties {
  const s: React.CSSProperties = {
    boxSizing: "border-box",
    background: colorValue(p.color) || token("surface"),
    color: colorValue(p.textColor) || token("onSurface"),
    border: `1px solid ${token("border")}`,
    borderRadius: token("radius"),
    padding: "8px 12px",
    fontFamily: token("font-body", "Segoe UI"),
    fontSize: p.fontSize != null ? px(p.fontSize) : "14px",
    fontWeight: p.bold ? 600 : 400,
    fontStyle: p.italic ? "italic" : "normal",
    outline: "none",
  };
  if (p.width != null) s.width = px(p.width);
  if (p.height != null) s.height = px(p.height);
  if (p.textAlign) s.textAlign = TEXT_ALIGN[p.textAlign] || "left";
  if (p.alignSelf) s.alignSelf = p.alignSelf;
  return s;
}

export const TextBox = (props: Any) => {
  const p = props || {};
  const isPassword = p.props && /PasswordChar/i.test(JSON.stringify(p.props));
  return (
    <input
      type={isPassword ? "password" : "text"}
      defaultValue={p.value != null ? String(p.value) : undefined}
      disabled={!!p.disabled}
      style={inputBase(p)}
    />
  );
};

export const EditBox = (props: Any) => {
  const p = props || {};
  const s = inputBase(p);
  s.resize = "vertical";
  if (p.height == null) s.minHeight = "72px";
  return <textarea defaultValue={p.value != null ? String(p.value) : undefined} disabled={!!p.disabled} style={s} />;
};

// ── Button / CommandButton ──────────────────────────────────────────────────────
const VARIANT_BG: Record<string, string> = {
  primary: "primary",
  secondary: "surface",
  ghost: "surface",
  danger: "danger",
};

function buttonStyle(p: Any): React.CSSProperties {
  const variant = p.variant || (p.flat ? "primary" : undefined);
  // resolve cor de fundo: variant conhecido -> token; senão tenta token literal
  let bgToken = variant ? VARIANT_BG[variant] || variant : undefined;
  const isGhost = variant === "ghost";
  const isSecondary = variant === "secondary";
  const onColored = variant === "primary" || variant === "danger" || (bgToken && !VARIANT_BG[variant!] && bgToken !== "surface");

  const s: React.CSSProperties = {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "0 16px",
    height: p.height != null ? px(p.height) : "40px",
    border: "1px solid transparent",
    borderRadius: token("radius"),
    fontFamily: token("font-body", "Segoe UI"),
    fontSize: "14px",
    fontWeight: 600,
    cursor: p.disabled ? "default" : "pointer",
    opacity: p.disabled ? 0.5 : 1,
    transition: "background 0.12s, filter 0.12s",
  };
  if (p.width != null) s.width = px(p.width);
  if (p.alignSelf) s.alignSelf = p.alignSelf;

  if (isGhost) {
    s.background = "transparent";
    s.color = token("onSurface");
    s.borderColor = token("border");
  } else if (isSecondary) {
    s.background = token("surface");
    s.color = token("onSurface");
    s.borderColor = token("border");
  } else if (bgToken) {
    s.background = token(bgToken);
    s.color = onColored ? token("onPrimary") : token("onSurface");
  } else {
    // botão padrão (CommandButton sem variant) — cinza neutro Win11
    s.background = token("surface");
    s.color = token("onSurface");
    s.borderColor = token("border");
  }
  return s;
}

const ButtonImpl = (props: Any) => {
  const p = props || {};
  const onClick = useFormEvent(p.onClick);
  const style = buttonStyle(p);
  // hover por shade: brightness sutil (Win11/Fluent)
  const onEnter = (e: Any) => {
    if (!p.disabled) e.currentTarget.style.filter = "brightness(0.94)";
  };
  const onLeave = (e: Any) => {
    e.currentTarget.style.filter = "none";
  };
  return (
    <button
      type="button"
      disabled={!!p.disabled}
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={style}
    >
      {p.icon ? <img src={`icons/${p.icon}.png`} alt="" style={{ width: "18px", height: "18px" }} /> : null}
      {p.caption != null ? <span>{p.caption}</span> : null}
    </button>
  );
};

export const Button = ButtonImpl;
export const CommandButton = ButtonImpl;

// ── CheckBox ─────────────────────────────────────────────────────────────────
export const CheckBox = (props: Any) => {
  const p = props || {};
  const onChange = useFormEvent(p.onInteractiveChange);
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        fontFamily: token("font-body", "Segoe UI"),
        fontSize: "14px",
        color: colorValue(p.textColor) || token("onSurface"),
        cursor: p.disabled ? "default" : "pointer",
        opacity: p.disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        defaultChecked={p.value === true || p.value === 1 || p.value === ".T."}
        disabled={!!p.disabled}
        onChange={onChange}
        style={{ accentColor: token("primary"), width: "16px", height: "16px" }}
      />
      {p.caption != null ? <span>{p.caption}</span> : null}
    </label>
  );
};

// ── ComboBox (select flat com chevron) ──────────────────────────────────────────
export const ComboBox = (props: Any) => {
  const p = props || {};
  const wrap: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
    width: p.width != null ? px(p.width) : "200px",
    height: p.height != null ? px(p.height) : "40px",
    alignSelf: p.alignSelf,
  };
  const sel: React.CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    background: colorValue(p.color) || token("surface"),
    color: colorValue(p.textColor) || token("onSurface"),
    border: `1px solid ${token("border")}`,
    borderRadius: token("radius"),
    padding: "0 28px 0 12px",
    fontFamily: token("font-body", "Segoe UI"),
    fontSize: "14px",
    appearance: "none",
    WebkitAppearance: "none",
    outline: "none",
    cursor: "pointer",
  };
  const chevron: React.CSSProperties = {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none",
    color: token("muted"),
    fontSize: "10px",
  };
  return (
    <span style={wrap}>
      <select defaultValue={p.value != null ? String(p.value) : undefined} disabled={!!p.disabled} style={sel}>
        {p.value != null ? <option>{String(p.value)}</option> : <option />}
      </select>
      <span style={chevron}>▼</span>
    </span>
  );
};

// ── Timer (no-op) ─────────────────────────────────────────────────────────────
export const Timer = (_props: Any) => null;

// ── Shape (retângulo arredondado: fundo de card/botão) ──────────────────────────
export const Shape = (props: Any) => {
  const p = props || {};
  const s: React.CSSProperties = {
    boxSizing: "border-box",
    width: px(p.width),
    height: px(p.height),
    background: p.transparent ? "transparent" : colorValue(p.color || p.variant) || token("surface"),
    borderRadius: p.rounded != null ? px(p.rounded) : token("radius"),
    alignSelf: p.alignSelf,
  };
  if (p.borderWidth != null) {
    s.border = `${px(p.borderWidth)} solid ${colorValue(p.borderColor) || token("border")}`;
  }
  return <div style={s}>{p.children}</div>;
};

// ── Image ─────────────────────────────────────────────────────────────────────
export const Image = (props: Any) => {
  const p = props || {};
  // native size matters (VFP não escala alpha PNG): só fixa width/height pedidos.
  return (
    <img
      src={p.src ?? p.picture}
      width={p.width}
      height={p.height}
      alt=""
      style={{ display: "block", objectFit: p.stretch === 2 ? "fill" : "contain", alignSelf: p.alignSelf }}
    />
  );
};

// ── OptionGroup (grupo de rádio vertical) ───────────────────────────────────────
export const OptionGroup = (props: Any) => {
  const p = props || {};
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        fontFamily: token("font-body", "Segoe UI"),
        fontSize: "14px",
        color: token("onSurface"),
        alignSelf: p.alignSelf,
        width: px(p.width),
      }}
    >
      {p.children}
    </div>
  );
};
