import "react";

declare module "react" {
  // The panel's styles take per-element values, like a row's place in a stagger, as custom
  // properties.
  interface CSSProperties {
    [property: `--${string}`]: string | number;
  }
}
