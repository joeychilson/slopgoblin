/** A rounded action link, cream on the page's green. */
export function PillLink(props: { href: string; size: "small" | "large"; children: string }) {
  return (
    <a href={props.href} className={`pill is-${props.size}`}>
      {props.children}
    </a>
  );
}
