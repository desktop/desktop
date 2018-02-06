# GitHub Desktop Engineering Values

There's value in defining what we as shepherds of this project believe are important traits and practices. As we grow and welcome new members into our team it's beneficial to have a sense of what guided us towards the product being implemented the way it has been.

## What this is and what this isn't

These values are not unbendable rules. They're an attempt to share knowledge about how the application came to be and how we currently think it should be developed. It's a non-exhaustive, living document of intentions, and beliefs.

We've chosen to focus exclusively on the engineering (i.e. how we write code) part in this document. There are other values surrounding visual design, product and project management, community etc that we're not going to consider here.

## Our values

1. [Types are good](#types-are-good)
2. [Immutability is good](#immutability-is-good)
3. [Passing values to functions is good](#passing-values-to-functions-is-good)

### Types are good

We believe in strongly typed programming languages that help us avoid mistakes that are all too easy to make. When the compiler can't help us we believe in augmenting with other kinds of static analysis. Type systems and static analysis helps us not only in the moment we're writing code but also extends further out. By codifying our intentions we help prevent the next person from making a mistake.

#### Examples

Our [`assertNever`](https://github.com/desktop/desktop/blob/d26fd1ee670dfa7f16ded74b7a4108d2bfe68c79/app/src/lib/fatal-error.ts#L6-L21) helper lets us leverage the type system to verify exhaustiveness and get [compile-time errors](https://github.com/desktop/desktop/blob/8fc8e6f5d1a8153cc92bb0e324b9c26602211646/app/src/ui/branches/ci-status.tsx#L36-L47) when that assertion fails.

Our [`react-readonly-props-and-state`](https://github.com/desktop/desktop/blob/d26fd1ee670dfa7f16ded74b7a4108d2bfe68c79/tslint-rules/reactReadonlyPropsAndStateRule.ts) static analysis ensures that we don't accidentally mutate state which React prohibits being mutated but isn't able to enforce due to the dynamic runtime.

We [write our own type definitions](https://github.com/desktop/desktop/blob/eee92a96943afbc39057b1aae66c642e23dbf136/app/src/lib/globals.d.ts#L94-L112) when none exist.

### Immutability is good

By choosing to keep as much of our state as possible in immutable data structures we can be explicit about when and where we update it and have confidence that it's not going to change from underneath us. The last part is especially important in an application such as GitHub Desktop which has lots of state. The best way we've found so far to maintain our sanity is to be explicit about how that state flows through the app and when it's updated and immutability is one tool to help us stay on the right track.

#### Examples

We use [read-only versions of arrays](https://github.com/desktop/desktop/blob/a61a5bdc94ee8237dfff328957cdaee99a9b61e1/app/src/models/commit.ts#L21) in interfaces and object as well as [in function parameters](https://github.com/desktop/desktop/blob/355f9671860e4777827912ddc6aac44399f5732f/app/src/lib/email.ts#L17). (

We prefer

```ts
const a = someCondition ? someValue : someOtherValue
```

over

```ts
let a = someDefaultValue
if (someCondition) {
 a = someOtherValue
}
```

We prefer the first example to the second because it states to ourselves and future readers that you can trust `a` to not change. Not only does it make that intention clear, it enforces it. In the case of `let` we'd have to scan the method to verify that it doesn't get mutated and even then we can't be sure that some developer in the future adds logic which changes it. Again, we're stating our intentions and letting the type system help us keep our promises.

If the checks required to determine the result are too complicated it might be time to create another function which does the heavy lifting and returns a value that you can assign to a `const`.

### Passing values to functions is good

We believe that small, consistent, and composable methods are easier to understand, and less prone to errors than larger methods operating on data from sources other than those passed to it via arguments. You might recognize this sentiment from the concept of pure functions in functional programming. While we aren't using a language which lets us express such conditions we believe in striving towards writing methods which act on values that is provided to it via arguments and returns a consistent result based solely on those values.

If a method has to acquire data from multiple sources to then do some processing on it we prefer that the gathering of data and the processing of it is separated into two methods such that the computational part doesn't get entangled with acquisition of state.

At times we move methods out of classes or even out into their own file to reinforce that it's a function only acting on its given parameters (as opposed to instance fields or shared variables the function has closed over).

#### Examples

In app-menu-bar we've extracted a method called [`createState`](https://github.com/desktop/desktop/blob/d26fd1ee670dfa7f16ded74b7a4108d2bfe68c79/app/src/ui/app-menu/app-menu-bar.tsx#L50-L75) from the component to live outside of the class such that we can be sure that the only thing that matters to the outcome of that function is the props object that's passed to it. By doing this we can avoid a very common example of using `this.props` inside of the method when, in fact, we might want to create a state object from `nextProps` or even `prevProps` that was given to us from one of the [React lifecycle methods](https://reactjs.org/docs/react-component.html#the-component-lifecycle).

## Recommended resources

- [Lifting state up](https://reactjs.org/docs/lifting-state-up.html)
- [The Value of Values](https://www.infoq.com/presentations/Value-Values)
- [Simple Made Easy](https://www.infoq.com/presentations/Simple-Made-Easy)
- [Boundaries aka Functional Core, Imperative Shell](https://www.destroyallsoftware.com/talks/boundaries)
