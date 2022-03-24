
import * as React from 'react'

import { Row } from '../lib/row'
import { getFonts } from 'font-list'
import { DialogContent } from '../dialog'
import { getPersistedFontFace, getPersistedFontSize } from '../lib/application-theme'
interface IFontProps {
  readonly selectedFontFace: string  | null
  readonly selectedFontSize: number
  readonly onSelectedFontFaceChanged: (fontFace: string) => void
  readonly onSelectedFontSizeChanged: (size: number) => void
}

interface IFontState {
  readonly availableFonts: string[] | null
  readonly selectedFontFace: string | undefined

  readonly selectedFontSize: number
}


export class Font extends React.Component<
  IFontProps,
  IFontState
> {
  public constructor(props: IFontProps) {
    super(props)
    this.state = { availableFonts: null, selectedFontFace: props.selectedFontFace ?? undefined ,selectedFontSize: props.selectedFontSize ?? 0} 
    if (this.state.selectedFontFace == null)
    {
      this.initializeSelectedFontFace(); 
    }

    if (this.state.selectedFontSize === 0)
    {
      this.initializeSelectedFontSize(); 
    }
  }

  public async componentDidMount()
  {
     getFonts({ disableQuoting: true })
    .then(fonts => {
      this.setState({ availableFonts: fonts })
    })
    .catch(err => {
      console.error(err)
    })
  }

  public async componentDidUpdate(prevProps: IFontProps) {
    if (prevProps.selectedFontFace === this.props.selectedFontFace
        && prevProps.selectedFontSize === this.props.selectedFontSize) {
      return
    }

    const selectedFontFace = this.props.selectedFontFace ?? await getPersistedFontFace()
    
    const selectedFontSize = this.props.selectedFontSize ?? await getPersistedFontSize()

    this.setState({ selectedFontFace:selectedFontFace ,selectedFontSize: selectedFontSize})
  }

  private initializeSelectedFontFace = async () => {
    const currentFontFace = await getPersistedFontFace()
    this.setState({ selectedFontFace:currentFontFace })
  }


  private initializeSelectedFontSize = async () => {
    const currentFontSize = await getPersistedFontSize()
    this.setState({ selectedFontSize:currentFontSize})
  }

  private onSelectedFontFaceChanged = (event: React.FormEvent<HTMLSelectElement>): void => {
    this.props.onSelectedFontFaceChanged(event.currentTarget.value);
  }

   private onSelectedFontSizeChanged = (event: React.FormEvent<HTMLInputElement>): void => {
    this.props.onSelectedFontSizeChanged(parseFloat(event.currentTarget.value));
  }

  public async render() {

    return (
      <DialogContent>
        <Row>
           <label htmlFor="fontFaceChooser">Font Face</label><br></br>
          <select defaultValue={(await getPersistedFontFace())} id="fontFaceChooser" onChange={this.onSelectedFontFaceChanged}>
        {
          this.state.availableFonts?.map((fontName, index) =>
          {
              return <option key={index} value={fontName}>{fontName}</option>
          })
        }
          </select>
        </Row>
        <Row>
          <label htmlFor="font-size">Font Size</label><br></br>
          <input type="number" defaultValue={(await getPersistedFontSize()).toString()} id="font-size"  name="font-size" min="6" max="48" onChange={this.onSelectedFontSizeChanged}></input>
        </Row>
      </DialogContent>
    )
  }
}
