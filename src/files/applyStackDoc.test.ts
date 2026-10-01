jest.mock('@/pouchdb/persistStackDoc', () => ({
  persistStackDoc: jest.fn().mockResolvedValue(undefined)
}))

import type CozyClient from 'cozy-client'

import { persistStackDoc } from '@/pouchdb/persistStackDoc'

import { applyStackDoc } from './applyStackDoc'

describe('applyStackDoc', () => {
  it('writes the document into the local database, then into the store', async () => {
    const order: string[] = []
    ;(persistStackDoc as jest.Mock).mockImplementation(async () => {
      order.push('database')
    })
    const setData = jest.fn(() => {
      order.push('store')
    })
    const client = { setData } as unknown as CozyClient
    const doc = { _id: 'a', _rev: '3-c', name: 'restored', dir_id: 'root' }

    await applyStackDoc(client, doc)

    const typed = { ...doc, _type: 'io.cozy.files' }
    expect(persistStackDoc).toHaveBeenCalledWith(client, typed)
    expect(setData).toHaveBeenCalledWith({ 'io.cozy.files': [typed] })
    expect(order).toEqual(['database', 'store'])
  })
})
