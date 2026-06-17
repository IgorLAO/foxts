// preview/runtime/kit.tsx — UI Kit composto (renderizador React do preview).
//
// Cada componente espelha as interfaces de decorators.ts (GridProps, StatCardProps, …)
// e estiliza SÓ por tokens de tema (token("primary") → var(--primary)). Eventos são
// nomes de método do form resolvidos por useFormEvent. Estética Win11/Fluent: flat,
// cantos var(--radius), grade de 8px. Self-contained — não importa layout/primitives.
import React from "react";
import { token } from "./theme";
import { useFormEvent } from "./context";

// ─────────────────────────────────────────────────────────────────────────────
// helpers de estilo (mínimos, duplicados de propósito — sem importar Agente A)
// ─────────────────────────────────────────────────────────────────────────────

const RADIUS = "var(--radius, 8px)";

/** aplica os campos de FlexItemProps comuns (width/height/grow/alignSelf) a um style. */
function flexItem(props: any, base: React.CSSProperties): React.CSSProperties {
  const s: React.CSSProperties = { ...base };
  if (props?.width != null) s.width = props.width;
  if (props?.height != null) s.height = props.height;
  const grow = props?.grow ?? props?.flexGrow;
  if (grow != null) s.flexGrow = grow === true ? 1 : grow;
  if (props?.alignSelf) {
    s.alignSelf =
      props.alignSelf === "start" ? "flex-start" : props.alignSelf === "end" ? "flex-end" : props.alignSelf;
  }
  return s;
}

/** mapeia variant → {bg, fg, hoverBg, border}. token desconhecido vira BackColor próprio. */
function variantColors(variant?: string): { bg: string; fg: string; border: string; hover: string; ghost?: boolean } {
  switch (variant) {
    case "secondary":
      return { bg: token("surface"), fg: token("onSurface"), border: token("border"), hover: token("altRow") };
    case "ghost":
      return { bg: "transparent", fg: token("onSurface"), border: "transparent", hover: token("altRow"), ghost: true };
    case "danger":
      return { bg: token("danger"), fg: token("onPrimary", "#fff"), border: "transparent", hover: token("danger") };
    case "success":
      return { bg: token("success"), fg: token("onPrimary", "#fff"), border: "transparent", hover: token("success") };
    case undefined:
    case "":
    case "primary":
      return { bg: token("primary"), fg: token("onPrimary", "#fff"), border: "transparent", hover: token("primary") };
    default:
      // token de cor arbitrário (ex.: "warning") como fundo
      return { bg: token(variant), fg: token("onPrimary", "#fff"), border: "transparent", hover: token(variant) };
  }
}

/** hover state genérico (retorna handlers + flag). */
function useHover(): [boolean, { onMouseEnter: () => void; onMouseLeave: () => void }] {
  const [h, setH] = React.useState(false);
  return [h, { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) }];
}

/** <img> de ícone (icons/<name>.png) à esquerda de um caption. */
function IconImg({ name, color, size = 16 }: { name?: string; color?: string; size?: number }) {
  if (!name) return null;
  const src = `icons/${name}${color ? `-${color}` : ""}.png`;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "inline-block" }}
    />
  );
}

const FONT_BODY = "var(--font-body, var(--font, 'Segoe UI'))";
const FONT_TITLE = "var(--font-title, var(--font, 'Segoe UI'))";

// ─────────────────────────────────────────────────────────────────────────────
// Botões flat (base p/ FlatButton, SaveButton, OpenFormButton, ToolbarButton)
// ─────────────────────────────────────────────────────────────────────────────

function flatButton(props: {
  caption?: string;
  variant?: string;
  icon?: string;
  onClick?: string;
  compact?: boolean;
  full?: boolean;
  rootProps?: any;
}) {
  const v = variantColors(props.variant);
  const onClick = useFormEvent(props.onClick);
  const [hover, hoverHandlers] = useHover();
  // sombra de hover: ghost/secondary clareiam/escurecem o fundo; sólidos ganham overlay escuro.
  const padV = props.compact ? 6 : 9;
  const padH = props.compact ? 10 : 16;
  const style: React.CSSProperties = flexItem(props.rootProps, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxSizing: "border-box",
    padding: `${padV}px ${padH}px`,
    border: `1px solid ${v.border}`,
    borderRadius: RADIUS,
    background: hover && (v.ghost || props.variant === "secondary") ? v.hover : v.bg,
    color: v.fg,
    font: `600 ${props.compact ? 13 : 14}px ${FONT_BODY}`,
    cursor: onClick ? "pointer" : "default",
    userSelect: "none",
    whiteSpace: "nowrap",
    width: props.full ? "100%" : (props.rootProps?.width != null ? props.rootProps.width : undefined),
    // overlay de escurecimento p/ botões sólidos no hover
    filter: hover && !v.ghost && props.variant !== "secondary" ? "brightness(0.92)" : "none",
    transition: "background 120ms ease, filter 120ms ease",
  });
  return (
    <button type="button" onClick={onClick} style={style} {...hoverHandlers}>
      <IconImg name={props.icon} color={v.ghost || props.variant === "secondary" ? undefined : "white"} />
      {props.caption}
    </button>
  );
}

/** <FlatButton variant icon onClick caption> — CTA flat colorido. */
export const FlatButton = (props: any) =>
  flatButton({
    caption: props?.caption,
    variant: props?.variant,
    icon: props?.icon,
    onClick: props?.onClick,
    rootProps: props,
  });

/** <SaveButton> — botão "Salvar" pronto (primary, ícone save por padrão). */
export const SaveButton = (props: any) =>
  flatButton({
    caption: props?.caption ?? "Salvar",
    variant: props?.variant ?? "primary",
    icon: props?.icon ?? "save",
    onClick: props?.onClick,
    rootProps: props,
  });

/** <OpenFormButton form caption> — botão de navegação (DO FORM no build). No preview
 *  apenas renderiza o botão; a navegação real é resolvida pelo host se houver handler. */
export const OpenFormButton = (props: any) =>
  flatButton({
    caption: props?.caption ?? "Abrir",
    variant: props?.variant ?? "secondary",
    icon: props?.icon,
    onClick: props?.onClick,
    rootProps: props,
  });

// ─────────────────────────────────────────────────────────────────────────────
// StatCard — cartão de métrica de dashboard
// ─────────────────────────────────────────────────────────────────────────────

export const StatCard = (props: any) => {
  const label = props?.label ?? "";
  const value = props?.value ?? "";
  const delta: string | undefined = props?.delta;
  const deltaColor = delta?.trim().startsWith("-") ? token("danger") : token("success");
  const style = flexItem(props, {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxSizing: "border-box",
    padding: props?.padding ?? 16,
    background: token("surface"),
    border: `1px solid ${token("border")}`,
    borderRadius: RADIUS,
    boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
    minWidth: 0,
  });
  return (
    <div style={style}>
      <div
        style={{
          font: `600 11px ${FONT_BODY}`,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: token("muted"),
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ font: `700 28px ${FONT_TITLE}`, color: token("onSurface"), lineHeight: 1.1 }}>{value}</span>
        {delta != null && delta !== "" ? (
          <span style={{ font: `600 13px ${FONT_BODY}`, color: deltaColor }}>{delta}</span>
        ) : null}
      </div>
      {props?.children}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FormField — label + input estilizado (coluna)
// ─────────────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: "8px 10px",
  border: `1px solid ${token("border")}`,
  borderRadius: RADIUS,
  background: token("surface"),
  color: token("onSurface"),
  font: `400 14px ${FONT_BODY}`,
  outline: "none",
};

export const FormField = (props: any) => {
  const label = (props?.label ?? "") + (props?.required ? " *" : "");
  const onChange = useFormEvent(props?.onInteractiveChange);
  const style = flexItem(props, { display: "flex", flexDirection: "column", gap: 6 });
  return (
    <div style={style}>
      <label style={{ font: `600 12px ${FONT_BODY}`, color: token("muted") }}>{label}</label>
      <input
        name={props?.name ?? props?.bind}
        defaultValue={props?.value ?? ""}
        onChange={onChange ? () => onChange() : undefined}
        style={inputStyle}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup — label + combobox flat com chevron
// ─────────────────────────────────────────────────────────────────────────────

export const Lookup = (props: any) => {
  const label = (props?.label ?? "") + (props?.required ? " *" : "");
  const onChange = useFormEvent(props?.onInteractiveChange);
  const style = flexItem(props, { display: "flex", flexDirection: "column", gap: 6 });
  return (
    <div style={style}>
      {props?.label != null ? (
        <label style={{ font: `600 12px ${FONT_BODY}`, color: token("muted") }}>{label}</label>
      ) : null}
      <div style={{ position: "relative", width: "100%" }}>
        <select
          name={props?.name ?? props?.bind}
          onChange={onChange ? () => onChange() : undefined}
          style={{
            ...inputStyle,
            appearance: "none",
            WebkitAppearance: "none",
            paddingRight: 28,
            cursor: "pointer",
          }}
        >
          <option value="">{props?.display ? `Buscar ${props.display}...` : "Selecione..."}</option>
        </select>
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: token("muted"),
            fontSize: 10,
          }}
        >
          ▼
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SearchBox — input de busca flat com ícone
// ─────────────────────────────────────────────────────────────────────────────

export const SearchBox = (props: any) => {
  const onSearch = useFormEvent(props?.onSearch ?? props?.onInteractiveChange);
  const style = flexItem(props, {
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxSizing: "border-box",
    padding: "8px 12px",
    border: `1px solid ${token("border")}`,
    borderRadius: RADIUS,
    background: token("surface"),
  });
  return (
    <div style={style}>
      <IconImg name="search" color="muted" size={16} />
      <input
        name={props?.name ?? props?.bind}
        placeholder={props?.placeholder ?? "Buscar..."}
        onChange={onSearch ? () => onSearch() : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          color: token("onSurface"),
          font: `400 14px ${FONT_BODY}`,
        }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState — mensagem centrada + ação opcional
// ─────────────────────────────────────────────────────────────────────────────

export const EmptyState = (props: any) => {
  const onAction = useFormEvent(props?.onAction);
  const style = flexItem(props, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
    textAlign: "center",
  });
  return (
    <div style={style}>
      <IconImg name={props?.icon ?? "file"} color="muted" size={32} />
      <div style={{ font: `400 14px ${FONT_BODY}`, color: token("muted") }}>{props?.message}</div>
      {props?.action ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            border: "1px solid transparent",
            borderRadius: RADIUS,
            background: token("primary"),
            color: token("onPrimary", "#fff"),
            font: `600 14px ${FONT_BODY}`,
            cursor: onAction ? "pointer" : "default",
          }}
        >
          {props?.icon ? <IconImg name={props.icon} color="white" /> : null}
          {props.action}
        </button>
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FormActions — linha de ações à direita (Cancelar + OK)
// ─────────────────────────────────────────────────────────────────────────────

export const FormActions = (props: any) => {
  const cancel = props?.cancel;
  const style = flexItem(props, { display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" });
  return (
    <div style={style}>
      {cancel !== false
        ? flatButton({
            caption: typeof cancel === "string" ? cancel : "Cancelar",
            variant: "secondary",
            onClick: props?.onCancel,
            rootProps: {},
          })
        : null}
      {flatButton({
        caption: props?.ok ?? "OK",
        variant: props?.variant ?? "primary",
        icon: props?.icon,
        onClick: props?.onOk,
        rootProps: {},
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar / ToolbarButton / ToolbarSeparator
// ─────────────────────────────────────────────────────────────────────────────

export const Toolbar = (props: any) => {
  const style = flexItem(props, {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: props?.gap ?? 4,
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    background: token("surface"),
    borderBottom: `1px solid ${token("border")}`,
  });
  return <div style={style}>{props?.children}</div>;
};

export const ToolbarButton = (props: any) =>
  flatButton({
    caption: props?.label ?? props?.caption,
    variant: props?.variant ?? "ghost",
    icon: props?.icon,
    onClick: props?.onClick,
    compact: true,
    rootProps: props,
  });

export const ToolbarSeparator = (props: any) => (
  <span
    aria-hidden
    style={{
      display: "inline-block",
      width: 1,
      height: props?.height ?? 20,
      margin: "0 4px",
      background: token("border"),
      flexShrink: 0,
    }}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar / SidebarItem
// ─────────────────────────────────────────────────────────────────────────────

export const Sidebar = (props: any) => {
  const style = flexItem(props, {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    width: props?.width ?? 180,
    boxSizing: "border-box",
    padding: 8,
    background: token("surface"),
    borderRight: `1px solid ${token("border")}`,
    height: props?.height,
  });
  return <div style={style}>{props?.children}</div>;
};

export const SidebarItem = (props: any) => {
  const active = !!props?.active;
  const onClick = useFormEvent(props?.onClick);
  const [hover, hoverHandlers] = useHover();
  const bg = active ? token("primary", "rgba(37,99,235,0.12)") : hover ? token("altRow") : "transparent";
  // fundo primary "suave": usamos uma sobreposição translúcida do primary via box-shadow inset
  const style: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 12px 9px 14px",
    border: "none",
    borderRadius: RADIUS,
    background: active ? "color-mix(in srgb, var(--primary) 12%, transparent)" : hover ? token("altRow") : "transparent",
    color: active ? token("primary") : token("onSurface"),
    font: `${active ? 600 : 500} 14px ${FONT_BODY}`,
    cursor: onClick ? "pointer" : "default",
    textAlign: "left",
    transition: "background 120ms ease",
  };
  void bg;
  return (
    <button type="button" onClick={onClick} style={style} {...hoverHandlers}>
      {active ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 6,
            bottom: 6,
            width: 3,
            borderRadius: 3,
            background: token("primary"),
          }}
        />
      ) : null}
      <IconImg name={props?.icon} color={active ? "primary" : "muted"} size={18} />
      {props?.label}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Grid — dois modos: layout (columns) e dados (source + <GridColumn>)
// ─────────────────────────────────────────────────────────────────────────────

/** <GridColumn> — metadado lido pelo Grid (header/field/width). Não renderiza só. */
export const GridColumn = (_props: any) => null;

/** lê as props dos filhos <GridColumn> (mesmo quando vêm como array/aninhados). */
function readColumns(children: any): Array<{ header: string; field?: string; width?: number }> {
  const cols: Array<{ header: string; field?: string; width?: number }> = [];
  React.Children.forEach(children, (child: any) => {
    if (!child || typeof child !== "object") return;
    const p = child.props || {};
    // só consideramos filhos com cara de coluna (header/field/bind)
    if (p.header != null || p.field != null || p.bind != null || p.width != null) {
      cols.push({ header: p.header ?? p.field ?? p.bind ?? "", field: p.field ?? p.bind, width: p.width });
    }
  });
  return cols;
}

export const Grid = (props: any) => {
  const isData = props?.source != null || props?.recordSource != null;

  // ── (a) GRID DE LAYOUT ──────────────────────────────────────────────────────
  if (!isData && props?.columns != null) {
    const style = flexItem(props, {
      display: "grid",
      gridTemplateColumns: `repeat(${props.columns}, 1fr)`,
      gap: props?.gap ?? 12,
      padding: props?.padding,
      boxSizing: "border-box",
    });
    return <div style={style}>{props?.children}</div>;
  }

  // ── (b) GRID DE DADOS ───────────────────────────────────────────────────────
  if (isData) {
    const cols = readColumns(props?.children);
    const zebra = props?.zebra !== false;
    const boldHeaders = props?.boldHeaders !== false;
    const gridLines = props?.gridLines ?? 1; // 0 none 1 horiz 2 vert 3 both
    const horiz = gridLines === 1 || gridLines === 3;
    const vert = gridLines === 2 || gridLines === 3;
    const cellBorderH = horiz ? `1px solid ${token("border")}` : "none";
    const cellBorderV = vert ? `1px solid ${token("border")}` : "none";
    const PLACEHOLDER_ROWS = 4;

    const wrapStyle = flexItem(props, {
      boxSizing: "border-box",
      border: `1px solid ${token("border")}`,
      borderRadius: RADIUS,
      overflow: "hidden",
      background: token("surface"),
    });

    return (
      <div style={wrapStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse", font: `400 13px ${FONT_BODY}` }}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    width: c.width,
                    background: token("altRow"),
                    color: token("onSurface"),
                    fontWeight: boldHeaders ? 700 : 500,
                    borderBottom: `1px solid ${token("border")}`,
                    borderRight: vert && i < cols.length - 1 ? cellBorderV : "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PLACEHOLDER_ROWS }).map((_, r) => (
              <tr
                key={r}
                style={{
                  background: zebra && r % 2 === 1 ? token("altRow") : token("surface"),
                }}
              >
                {cols.map((c, i) => (
                  <td
                    key={i}
                    style={{
                      padding: "8px 10px",
                      color: token("muted"),
                      borderBottom: r < PLACEHOLDER_ROWS - 1 ? cellBorderH : "none",
                      borderRight: vert && i < cols.length - 1 ? cellBorderV : "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {/* sem cursor vivo no preview: célula placeholder discreta */}
                    <span
                      style={{
                        display: "inline-block",
                        width: c.width ? Math.max(20, c.width - 28) : 64,
                        height: 8,
                        borderRadius: 4,
                        background: "color-mix(in srgb, var(--muted) 22%, transparent)",
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── fallback: sem columns nem source → caixa coluna simples ──────────────────
  const style = flexItem(props, { display: "flex", flexDirection: "column", gap: props?.gap ?? 12 });
  return <div style={style}>{props?.children}</div>;
};
