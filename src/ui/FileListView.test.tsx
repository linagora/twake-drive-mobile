import React from 'react'
import { RefreshControl, Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'

import { FileListView } from './FileListView'

interface Row {
  _id: string
  name: string
}

const items: Row[] = [{ _id: 'a', name: 'alpha' }]

type ViewProps = React.ComponentProps<typeof FileListView<Row>>

const renderView = (props: Partial<ViewProps> = {}): ReturnType<typeof render> =>
  render(
    <FileListView<Row>
      items={items}
      keyExtractor={item => item._id}
      renderItem={({ item }) => <Text>{item.name}</Text>}
      emptyMessage="drive.emptyFolder"
      {...props}
    />
  )

describe('FileListView', () => {
  it('lists what it is given', () => {
    renderView()
    expect(screen.getByText('alpha')).toBeOnTheScreen()
  })

  it('waits on the first fetch rather than claiming the folder is empty', () => {
    renderView({ items: [], loading: true })
    expect(screen.queryByText('drive.emptyFolder')).toBeNull()
  })

  it('says a folder is empty once the fetch is done', () => {
    renderView({ items: [], loading: false })
    expect(screen.getByText('drive.emptyFolder')).toBeOnTheScreen()
  })

  it('keeps the list pullable when it is empty', () => {
    const onRefresh = jest.fn()
    renderView({ items: [], onRefresh })
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh')
    expect(onRefresh).toHaveBeenCalled()
  })

  it('surfaces a failed fetch instead of the list, and offers a retry', () => {
    const onRetry = jest.fn()
    renderView({ error: new Error('boom'), onRetry })
    expect(screen.queryByText('alpha')).toBeNull()
    fireEvent.press(screen.getByText('common.retry'))
    expect(onRetry).toHaveBeenCalled()
  })

  it('renders the header above the list, and keeps it while empty', () => {
    renderView({ items: [], header: <Text>header</Text> })
    expect(screen.getByText('header')).toBeOnTheScreen()
  })
})
