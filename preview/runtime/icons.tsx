// preview/runtime/icons.tsx — Icon + aliases nomeados (estilo lucide-react).
//
// No preview renderizamos um <img> apontando para os MESMOS PNGs do build, servidos
// estaticamente da pasta icons/ do projeto. A convenção de cor é icons/<name>-<color>.png
// (ex.: bag-primary.png); sem `color`, icons/<name>.png. Trocar o set de ícones (ou o
// tema) reflete aqui ao vivo sem mexer nos forms.
import type React from "react";

/** caminho do PNG a partir do nome + variante de cor (token). */
function iconSrc(name: string, color?: string): string {
  return `icons/${name}${color ? `-${color}` : ""}.png`;
}

/** <Icon name size color/> — ícone rasterizado (alpha) exibido num <img>. */
export const Icon = (props: any) => {
  const name: string = props?.name ?? "";
  const size: number = props?.size ?? 18;
  const color: string | undefined = props?.color;
  const style: React.CSSProperties = {
    display: "inline-block",
    flexShrink: 0,
    width: size,
    height: size,
    objectFit: "contain",
    verticalAlign: "middle",
    ...(props?.style || {}),
  };
  return (
    <img
      src={iconSrc(name, color)}
      width={size}
      height={size}
      alt={props?.alt ?? name}
      draggable={false}
      style={style}
    />
  );
};

/** fábrica de alias: <SaveIcon size color/> = <Icon name="save" .../>. */
const alias = (name: string) => (props: any) => <Icon {...props} name={name} />;

export const SaveIcon = alias("save");
export const SearchIcon = alias("search");
export const UserIcon = alias("user");
export const UsersIcon = alias("users");
export const SettingsIcon = alias("settings");
export const TrashIcon = alias("trash");
export const PlusIcon = alias("plus");
export const EditIcon = alias("edit");
export const HomeIcon = alias("home");
export const ChartIcon = alias("chart");
export const BagIcon = alias("bag");
export const BellIcon = alias("bell");
export const CheckIcon = alias("check");
export const XIcon = alias("x");
export const FileIcon = alias("file");
export const FolderIcon = alias("folder");
export const CreditCardIcon = alias("credit-card");
export const LogOutIcon = alias("log-out");
export const MenuIcon = alias("menu");
