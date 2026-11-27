/** A rounded action link: cream on the green ground, green on the cream sheet. */
export function PillLink(props: {
  href: string;
  tone: "ground" | "sheet";
  size: "small" | "large";
  children: string;
}) {
  return (
    <a href={props.href} className={`pill is-${props.tone} is-${props.size}`}>
      {props.children}
    </a>
  );
}
