// @ts-check

const { ESLintUtils } = require('@typescript-eslint/experimental-utils')

const RuleTester = ESLintUtils.RuleTester
const rule = require('../react-proper-lifecycle-methods')

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

const ruleTester = new RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2015,
    sourceType: 'module',
  },
})
ruleTester.run('react-proper-lifecycle-methods', rule, {
  valid: [
    // component without lifecycle methods passes without errors
    {
      filename: 'app/src/component-no-state.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}
      
export class CloningRepositoryView extends React.Component<ICloningRepositoryProps> {
    public render() {
      return null
    }
}
`,
    },
    {
      filename: 'app/src/component-lifecycle-events-no-state.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps> {
    public componentWillMount() {}

    public componentDidMount() {}

    public componentWillUnmount() {}

    public componentWillUpdate(nextProps: ICloningRepositoryProps) {}

    public componentDidUpdate(prevProps: ICloningRepositoryProps) {}
  
    public render() {
        return null
    }
}
`,
    },
    {
      filename: 'app/src/component-lifecycle-events-with-state.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

interface ICloningRepositoryState {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps,ICloningRepositoryState> {
    public componentWillMount() {}

    public componentDidMount() {}

    public componentWillUnmount() {}

    public componentWillUpdate(nextProps: ICloningRepositoryProps, nextState: ICloningRepositoryState) {}

    public componentDidUpdate(prevProps: ICloningRepositoryProps, prevState: ICloningRepositoryState) {}

    public render() {
      return null
    }
}
`,
    },
    {
      filename: 'app/src/pure-component-lifecycle-events-with-state.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

interface ICloningRepositoryState {}

export class CloningRepositoryView extends React.PureComponent<ICloningRepositoryProps,ICloningRepositoryState> {
    public componentWillMount() {}

    public componentDidMount() {}

    public componentWillUnmount() {}

    public componentWillUpdate(nextProps: ICloningRepositoryProps, nextState: ICloningRepositoryState) {}

    public componentDidUpdate(prevProps: ICloningRepositoryProps, prevState: ICloningRepositoryState) {}

    public render() {
      return null
    }
}
`,
    },
    {
      filename: 'app/src/component-lifecycle-events-with-type-literal.tsx',
      code: `
import * as React from 'react'

interface IWindowControlState {}

export class WindowControls extends React.Component<{}, IWindowControlState> {

  public shouldComponentUpdate(nextProps: {}, nextState: IWindowControlState) {
    return nextState.windowState !== this.state.windowState
  }

  public componentWillUpdate(nextProps: {}, nextState: IWindowControlState) { }

  public render() {
    return null
  }
}
`,
    },
    {
      filename: 'app/src/component-lifecycle-events-with-type-literal.tsx',
      code: `
import * as React from 'react'

interface IWindowControlState {}

export class WindowControls extends React.Component {

    public shouldComponentUpdate(nextProps: {}) {
        return nextState.windowState !== this.state.windowState
    }

    public componentWillUpdate(nextProps: {}) { }

    public render() {
        return null
    }
}
`,
    },
    // a regular class with the same method name is ignored
    {
      filename: 'app/src/ui/other.tsx',
      code: `
  class Something {
    public componentWillUpdate(foo: string) {
      
    }
  }
  `,
    },
  ],
  invalid: [
    //
    // shouldComponentUpdate expects the first parameter to be nextProps and match the component's prop type
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps> {
    public shouldComponentUpdate(foo: string) { return true }
  
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'nameMismatch',
          data: {
            methodName: 'shouldComponentUpdate',
            parameterName: 'foo',
            expectedName: 'nextProps',
          },
        },
        {
          messageId: 'typeMismatch',
          data: {
            methodName: 'shouldComponentUpdate',
            parameterName: 'foo',
            expectedType: 'ICloningRepositoryProps',
          },
        },
      ],
    },
    //
    // shouldComponentUpdate expects the second parameter to be nextState and match the component's state type
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

interface ICloningRepositoryState {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps,ICloningRepositoryState> {
    public shouldComponentUpdate(nextProps: ICloningRepositoryProps, foo: string) { return true }
 
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'nameMismatch',
          data: {
            methodName: 'shouldComponentUpdate',
            parameterName: 'foo',
            expectedName: 'nextState',
          },
        },
        {
          messageId: 'typeMismatch',
          data: {
            methodName: 'shouldComponentUpdate',
            parameterName: 'foo',
            expectedType: 'ICloningRepositoryState',
          },
        },
      ],
    },
    //
    // shouldComponentUpdate is not permitted to have any additional parameters
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

interface ICloningRepositoryState {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps,ICloningRepositoryState> {
    public shouldComponentUpdate(nextProps: ICloningRepositoryProps, nextState: ICloningRepositoryState, additionalParam: void) { return true }
 
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'unknownParameter',
          data: {
            methodName: 'shouldComponentUpdate',
            parameterName: 'additionalParam',
          },
        },
      ],
    },

    //
    // componentWillUpdate expects the first parameter to be nextProps and match the component's prop type
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps> {
    public componentWillUpdate(bar: string) { }
  
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'nameMismatch',
          data: {
            methodName: 'componentWillUpdate',
            parameterName: 'bar',
            expectedName: 'nextProps',
          },
        },
        {
          messageId: 'typeMismatch',
          data: {
            methodName: 'componentWillUpdate',
            parameterName: 'bar',
            expectedType: 'ICloningRepositoryProps',
          },
        },
      ],
    },

    //
    // componentWillUpdate expects the first parameter to be nextProps and match the component's type literal
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface IWindowControlState {}

export class CloningRepositoryView extends React.Component<{}, IWindowControlState> {
    public componentWillUpdate(bar: string) { }
  
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'nameMismatch',
          data: {
            methodName: 'componentWillUpdate',
            parameterName: 'bar',
            expectedName: 'nextProps',
          },
        },
        {
          messageId: 'typeMismatch',
          data: {
            methodName: 'componentWillUpdate',
            parameterName: 'bar',
            expectedType: '{}',
          },
        },
      ],
    },

    //
    // componentWillUpdate expects the second parameter to be nextState and match the component's state type
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

interface ICloningRepositoryState {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps,ICloningRepositoryState> {
    public componentWillUpdate(nextProps: ICloningRepositoryProps, foo: string) {  }
 
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'nameMismatch',
          data: {
            methodName: 'componentWillUpdate',
            parameterName: 'foo',
            expectedName: 'nextState',
          },
        },
        {
          messageId: 'typeMismatch',
          data: {
            methodName: 'componentWillUpdate',
            parameterName: 'foo',
            expectedType: 'ICloningRepositoryState',
          },
        },
      ],
    },

    //
    // componentWillUpdate expects the first parameter to be nextProps and match the component's type
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface IWindowControlProps {}

interface IWindowControlState {}

export class CloningRepositoryView extends React.Component<IWindowControlProps, IWindowControlState> {
    public componentDidUpdate(bar: string) { }
  
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'nameMismatch',
          data: {
            methodName: 'componentDidUpdate',
            parameterName: 'bar',
            expectedName: 'prevProps',
          },
        },
        {
          messageId: 'typeMismatch',
          data: {
            methodName: 'componentDidUpdate',
            parameterName: 'bar',
            expectedType: 'IWindowControlProps',
          },
        },
      ],
    },

    //
    // componentDidUpdate expects the second parameter to be nextState and match the component's state type
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

interface ICloningRepositoryState {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps,ICloningRepositoryState> {
    public componentDidUpdate(prevProps: ICloningRepositoryProps, foo: string) {  }
 
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'nameMismatch',
          data: {
            methodName: 'componentDidUpdate',
            parameterName: 'foo',
            expectedName: 'prevState',
          },
        },
        {
          messageId: 'typeMismatch',
          data: {
            methodName: 'componentDidUpdate',
            parameterName: 'foo',
            expectedType: 'ICloningRepositoryState',
          },
        },
      ],
    },

    //
    // Methods inside a component following the `component*` or `shouldComponent*` pattern should be rejected
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

interface ICloningRepositoryProps {}

interface ICloningRepositoryState {}

export class CloningRepositoryView extends React.Component<ICloningRepositoryProps,ICloningRepositoryState> {
    public componentWillDoSomething() { }

    public shouldComponentFoo() { return false }
 
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'reservedMethodName',
          data: {
            methodName: 'componentWillDoSomething',
          },
        },
        {
          messageId: 'reservedMethodName',
          data: {
            methodName: 'shouldComponentFoo',
          },
        },
      ],
    },

    //
    // Methods inside a non-generic component following the `component*` or `shouldComponent*` pattern should be rejected
    //
    {
      filename: 'app/src/component.tsx',
      code: `
import * as React from 'react'

export class CloningRepositoryView extends React.Component {
    public componentWillDoSomething() { }

    public shouldComponentFoo() { return false }
 
    public render() {
        return null
    }
}
`,
      errors: [
        {
          messageId: 'reservedMethodName',
          data: {
            methodName: 'componentWillDoSomething',
          },
        },
        {
          messageId: 'reservedMethodName',
          data: {
            methodName: 'shouldComponentFoo',
          },
        },
      ],
    },
  ],
})
