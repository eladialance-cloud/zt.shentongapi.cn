declare module 'react-syntax-highlighter' {
  export const Prism: any;
  export const Light: any;
  export const dark: any;
  const content: any;
  export default content;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-dark' {
  const style: Record<string, React.CSSProperties>;
  export default style;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
