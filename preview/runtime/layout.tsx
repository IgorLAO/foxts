// preview/runtime/layout.tsx — caixas flex e composição do React Preview Runtime.
// Column / Row / View / Container / Panel / PageFrame / Page / Slot / Card.
// Estilo SÓ por tokens de tema (var(--token)); estética Win11/Fluent flat, grade de 8px.
import type React from "react";
import { token } from "./theme";

type Any = any;

// ── helpers (locais a este arquivo; sem novos arquivos compartilhados) ──────────
const px = (v: Any): string | undefined =>
  v == null ? undefined : typeof v === "number" ? `${v}px` : String(v);

const JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};
const ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

/** mapeia o token de cor de StyleProps (variant/color) -> valor CSS (var(--token) ou literal). */
function colorValue(name?: string): string | undefined {
  if (!name) return undefined;
  // hex/rgb literal passa direto; nome do tema -> var(--token)
  if (/^#|^rgb|^hsl/i.test(name)) return name;
  return token(name);
}

/** aplica os campos comuns de FlexItemProps (posição/tamanho dentro do pai flex). */
function flexItem(p: Any): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (p.width != null) s.width = px(p.width);
  if (p.height != null) s.height = px(p.height);
  const grow = p.flexGrow ?? p.grow;
  if (grow != null) s.flexGrow = grow === true ? 1 : Number(grow);
  if (p.alignSelf) s.alignSelf = ALIGN[p.alignSelf] || p.alignSelf;
  return s;
}

/** monta o estilo de uma caixa flex (Column/Row/View/Container/Panel). */
function boxStyle(p: Any, direction: "row" | "column"): React.CSSProperties {
  const dir = p.flexDirection || direction;
  const s: React.CSSProperties = {
    display: "flex",
    flexDirection: dir,
    boxSizing: "border-box",
  };
  if (p.gap != null) s.gap = px(p.gap);
  const pad = p.padding ?? p.pad;
  if (pad != null) s.padding = px(pad);
  if (p.justify) s.justifyContent = JUSTIFY[p.justify] || p.justify;
  if (p.align) s.alignItems = ALIGN[p.align] || p.align;
  if (p.wrap || p.flexWrap) s.flexWrap = p.flexWrap || (p.wrap ? "wrap" : undefined);
  return { ...s, ...flexItem(p) };
}

// ── Column / Row / View ─────────────────────────────────────────────────────────
export const Column = (props: Any) => {
  const p = props || {};
  if (p.absolute) return <Overlay {...p} />;
  return <div style={boxStyle(p, "column")}>{p.children}</div>;
};

export const Row = (props: Any) => {
  const p = props || {};
  if (p.absolute) return <Overlay {...p} />;
  return <div style={boxStyle(p, "row")}>{p.children}</div>;
};

export const View = (props: Any) => {
  const p = props || {};
  if (p.absolute) return <Overlay {...p} />;
  return <div style={boxStyle(p, p.flexDirection || "column")}>{p.children}</div>;
};

/** overlay: container relativo; filhos posicionados por left/top (sobre um fundo). */
const Overlay = (props: Any) => {
  const p = props || {};
  const base: React.CSSProperties = {
    position: "relative",
    boxSizing: "border-box",
    width: px(p.width),
    height: px(p.height),
  };
  const pad = p.padding ?? p.pad;
  if (pad != null) base.padding = px(pad);
  const kids = toArray(p.children).map((child: Any, i: number) => {
    const cp = child && child.props ? child.props : {};
    const pos: React.CSSProperties = {
      position: "absolute",
      left: cp.left != null ? px(cp.left) : 0,
      top: cp.top != null ? px(cp.top) : 0,
    };
    return (
      <div key={i} style={pos}>
        {child}
      </div>
    );
  });
  return <div style={base}>{kids}</div>;
};

function toArray(children: Any): Any[] {
  if (children == null) return [];
  return Array.isArray(children) ? children : [children];
}

// ── Container / Panel ─────────────────────────────────────────────────────────
/** caixa flex que vira "surface" real quando colorida; honra StyleProps. */
function surfaceStyle(p: Any, defaultDir: "row" | "column"): React.CSSProperties {
  const s = boxStyle(p, p.flexDirection || defaultDir);
  const bg = colorValue(p.variant || p.color);
  if (p.transparent) {
    s.background = "transparent";
  } else if (bg) {
    s.background = bg;
    if (p.variant) s.color = token("onPrimary"); // variant => texto contrastante
  } else {
    // surface sutil default
    s.background = token("surface");
  }
  if (p.rounded != null) s.borderRadius = px(p.rounded);
  else s.borderRadius = token("radius");
  if (p.borderWidth != null) {
    s.borderStyle = "solid";
    s.borderWidth = px(p.borderWidth);
    s.borderColor = colorValue(p.borderColor) || token("border");
  } else if (!p.transparent && !bg) {
    s.border = `1px solid ${token("border")}`;
  }
  return s;
}

export const Container = (props: Any) => {
  const p = props || {};
  return <div style={surfaceStyle(p, "column")}>{p.children}</div>;
};

export const Panel = Container;

// ── PageFrame / Page ─────────────────────────────────────────────────────────
/** PageFrame: tira de abas (caption de cada <Page>) + corpo da aba ativa. Estado simples. */
export const PageFrame = (props: Any) => {
  const p = props || {};
  const pages = toArray(p.children).filter(Boolean);
  // sem hooks de estado externo: usa o primeiro como ativo (preview estático);
  // o realce de aba é puramente visual.
  const active = 0;
  const tabStrip = pages.map((pg: Any, i: number) => {
    const cap = (pg && pg.props && pg.props.caption) || `Página ${i + 1}`;
    const on = i === active;
    const tabStyle: React.CSSProperties = {
      padding: "8px 16px",
      cursor: "default",
      fontFamily: token("font-body", "Segoe UI"),
      fontSize: "13px",
      color: on ? token("primary") : token("muted"),
      borderBottom: on ? `2px solid ${token("primary")}` : "2px solid transparent",
      fontWeight: on ? 600 : 400,
    };
    return (
      <div key={i} style={tabStyle}>
        {cap}
      </div>
    );
  });
  const frame: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    ...flexItem(p),
  };
  const strip: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    gap: "4px",
    borderBottom: `1px solid ${token("border")}`,
  };
  return (
    <div style={frame}>
      <div style={strip}>{tabStrip}</div>
      <div style={{ paddingTop: "12px" }}>{pages[active]}</div>
    </div>
  );
};

/** Page: corpo de uma aba (a caption é lida pelo PageFrame). */
export const Page = (props: Any) => {
  const p = props || {};
  const s: React.CSSProperties = {
    display: "flex",
    flexDirection: p.flexDirection || "column",
    boxSizing: "border-box",
  };
  if (p.gap != null) s.gap = px(p.gap);
  const pad = p.padding ?? p.pad;
  if (pad != null) s.padding = px(pad);
  return <div style={s}>{p.children}</div>;
};

// ── Slot ─────────────────────────────────────────────────────────────────────
/** ponto de inserção: renderiza os filhos (composição estilo React). */
export const Slot = (props: Any) => {
  const p = props || {};
  const hasLayout = p.direction || p.gap != null || p.padding != null || p.align || p.justify;
  if (!hasLayout) return <>{p.children}</>;
  const s: React.CSSProperties = { display: "flex", flexDirection: p.direction || "column" };
  if (p.gap != null) s.gap = px(p.gap);
  if (p.padding != null) s.padding = px(p.padding);
  if (p.align) s.alignItems = ALIGN[p.align] || p.align;
  if (p.justify) s.justifyContent = JUSTIFY[p.justify] || p.justify;
  return <div style={s}>{p.children}</div>;
};

// ── Card (compound: Card.Header / Card.Body / Card.Footer) ──────────────────────
const CardRoot = (props: Any) => {
  const p = props || {};
  const pad = p.pad ?? p.padding ?? 16;
  const bg = colorValue(p.variant || p.color);
  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    background: p.transparent ? "transparent" : bg || token("surface"),
    border: `1px solid ${colorValue(p.borderColor) || token("border")}`,
    borderRadius: p.rounded != null ? px(p.rounded) : token("radius"),
    padding: px(pad),
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
    gap: p.gap != null ? px(p.gap) : "12px",
    ...flexItem(p),
  };
  return (
    <div style={style}>
      {p.title ? (
        <div
          style={{
            fontFamily: token("font-title", "Segoe UI"),
            fontWeight: 600,
            fontSize: "15px",
            color: token("onSurface"),
          }}
        >
          {p.title}
        </div>
      ) : null}
      {p.children}
    </div>
  );
};

const CardHeader = (props: Any) => {
  const p = props || {};
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        paddingBottom: "8px",
        borderBottom: `1px solid ${token("border")}`,
        fontFamily: token("font-title", "Segoe UI"),
        fontWeight: 600,
        fontSize: "15px",
        color: token("onSurface"),
      }}
    >
      {p.children}
    </div>
  );
};

const CardBody = (props: Any) => {
  const p = props || {};
  return <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{p.children}</div>;
};

const CardFooter = (props: Any) => {
  const p = props || {};
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: "8px",
        paddingTop: "8px",
      }}
    >
      {p.children}
    </div>
  );
};

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
