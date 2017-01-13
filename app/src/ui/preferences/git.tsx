import * as React from 'react'
import { ConfigureGitUser } from '../lib/configure-git-user'
import { User } from '../../models/user'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Form } from '../lib/form'
import { setGlobalConfigValue, getGlobalConfigValue } from '../../lib/git/config'

interface IGitProps {
  readonly users: ReadonlyArray<User>
}

interface IGitState {
  readonly mergeTool: string | null
}

const MergeToolKeyName = 'merge.tool'

export class Git extends React.Component<IGitProps, IGitState> {
  public constructor(props: IGitProps) {
    super(props)

    this.state = { mergeTool: null }
  }

  public async componentDidMount() {
    const mergeTool = await getGlobalConfigValue(MergeToolKeyName)
    if (mergeTool) {
      this.setState({ mergeTool })
    }
  }

  public render() {
    return (
      <div>
        <Form onSubmit={this.saveMergeTool}>
          <TextBox
            label='Merge tool'
            placeholder='The tool to open to handle merge conflicts'
            value={this.state.mergeTool || undefined}
            onChange={this.onMergeToolChanged}
          />
          <Button type='submit'>Save</Button>
        </Form>

        <ConfigureGitUser users={this.props.users}/>
      </div>
    )
  }

  private onMergeToolChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const mergeTool = event.currentTarget.value
    this.setState({ mergeTool })
  }

  private saveMergeTool = async () => {
    const mergeTool = this.state.mergeTool
    if (mergeTool) {
      await setGlobalConfigValue(MergeToolKeyName, mergeTool)
    }
  }
}
