const mockGoBack = jest.fn()
const mockCanGoBack = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: mockCanGoBack }),
  useRouter: () => ({ replace: mockReplace })
}))

import { renderHook } from '@testing-library/react-native'

import { useTabBack } from './useTabBack'

describe('useTabBack', () => {
  beforeEach(() => {
    mockGoBack.mockReset()
    mockCanGoBack.mockReset()
    mockReplace.mockReset()
  })

  it('pops the tab stack when it has somewhere to go', () => {
    mockCanGoBack.mockReturnValue(true)
    renderHook(() => useTabBack('/(drive)/shared')).result.current()
    expect(mockGoBack).toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('returns to the tab root rather than leave the tab', () => {
    mockCanGoBack.mockReturnValue(false)
    renderHook(() => useTabBack('/(drive)/shared')).result.current()
    expect(mockGoBack).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(drive)/shared')
  })
})
