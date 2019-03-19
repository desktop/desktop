// based on https://codewithstyle.info/TypeScript-conditional-types-real-life-example/
export type PropsType<C> = C extends React.Component<infer P>
  ? P
  : C extends React.SFC<infer P>
  ? P
  : never
