import React from 'react'
import SpaceListItem from '../list_item'
import './style.css'

const SpaceList = ({spaces}) => (
  <div className='SpaceList'>
    {spaces.map((s) => {
      return (
        <SpaceListItem spaceId={s.id} key={s.id}/>
      )
    })}
  </div>
)

export default SpaceList
