import * as React from 'react'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'

interface ICloneRepositoryProps {
}

interface ICloneRepositoryState {
  readonly url: string
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<ICloneRepositoryProps, ICloneRepositoryState> {
  public constructor(props: ICloneRepositoryProps) {
    super(props)

    this.state = { url: '' }
  }

  public render() {
    const disabled = this.state.url.length === 0
    return (
      <Form className='clone-repository' onSubmit={this.clone}>
        <div>Enter a repository URL or GitHub username and repository (e.g., <pre>hubot/cool-repo</pre>)</div>
        <TextBox placeholder='URL or username/repository' value={this.state.url} onChange={this.onURLChange}/>
        <Button disabled={disabled} type='submit'>Clone</Button>
      </Form>
    )
  }

  private onURLChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ url: event.currentTarget.value })
  }

  private clone = () => {

  }
}
