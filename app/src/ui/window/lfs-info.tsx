import * as React from 'react'

export class LfsInfo extends React.Component {
  public render() {
    return (
      <div className='toast-notification-container lfs-info-container'>
        <div className='toast-notification lfs-info'>
          <p className='lfs-info-title'>Reverting commit...</p>
          <p className='lfs-info-detail'>
            Downloading big_picture.psd
            <span className='lfs-info-tertiary'>
              50/300MB
            </span>
          </p>
        </div>
      </div>
    )
  }
}
