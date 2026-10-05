import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { fireEvent, getByRole, getByText, queryByRole } from '@testing-library/dom'
import { useForm } from 'juststore'
import type { Root } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml'
import { api } from '@/lib/api-client'
import type { Config } from '@/types/godoxy/config/config'
import type { ReverseProxyRoute } from '@/types/godoxy/providers/routes'
import { configStore } from './store'

mock.module('@tanstack/react-router', () => ({ useBlocker: () => undefined }))

const initialConfig: Config = {
  providers: {
    include: ['routes.yml'],
    notification: [
      {
        name: 'Discord (webhook)',
        provider: 'webhook',
        template: 'discord',
        url: 'https://example.test/discord',
      },
      {
        name: 'gotify',
        provider: 'gotify',
        url: 'https://example.test/gotify',
        token: 'test-token',
      },
    ],
  },
  match_domains: ['example.test'],
  defaults: { healthcheck: { disable: true } },
}
const initialRoute = parseYAML(
  'scheme: http\nhost: app\nport: 8080\nidlewatcher:\n  idle_timeout: 5m\n'
) as ReverseProxyRoute
const getFile = mock(async () => ({ data: stringifyYAML(initialConfig) }))
const validateFile = mock(async () => ({}))
const setFile = mock(async () => ({}))
api.file.get = getFile as unknown as typeof api.file.get
api.file.validate = validateFile as unknown as typeof api.file.validate
api.file.set = setFile as unknown as typeof api.file.set

let act: typeof import('react').act
let createRoot: typeof import('react-dom/client').createRoot
let DefaultValues: typeof import('./general_config/DefaultValues').default
let ConfigStateSyncronizer: typeof import('./ConfigStateSyncronizer').default
let ConfigSaveButton: typeof import('./ConfigSaveButton').default
let RouteIdlewatcherSection: typeof import('./route_files/RouteIdlewatcherSection').RouteIdlewatcherSection
let dom: JSDOM
let container: HTMLDivElement
let root: Root
let savedRoute: ReverseProxyRoute | undefined

function RouteEditor({
  route,
  onSave,
}: {
  route: ReverseProxyRoute
  onSave: (route: ReverseProxyRoute) => void
}) {
  const form = useForm(route)
  return (
    <form onSubmit={form.handleSubmit(onSave)}>
      <RouteIdlewatcherSection form={form} />
      <button type="submit">Save route</button>
    </form>
  )
}

describe('idle sleep notification editors', () => {
  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT: true,
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      SVGElement: dom.window.SVGElement,
      Element: dom.window.Element,
      Node: dom.window.Node,
      NodeFilter: dom.window.NodeFilter,
      navigator: dom.window.navigator,
      MutationObserver: dom.window.MutationObserver,
      localStorage: dom.window.localStorage,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      requestAnimationFrame: (callback: FrameRequestCallback) =>
        setTimeout(() => callback(performance.now()), 0),
      cancelAnimationFrame: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
      ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    })
    Object.assign(dom.window, {
      requestAnimationFrame: globalThis.requestAnimationFrame,
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    })
    const react = await import('react')
    const reactDOM = await import('react-dom/client')
    act = react.act
    createRoot = reactDOM.createRoot
    ;[DefaultValues, ConfigStateSyncronizer, ConfigSaveButton, RouteIdlewatcherSection] =
      await Promise.all([
        import('./general_config/DefaultValues').then(module => module.default),
        import('./ConfigStateSyncronizer').then(module => module.default),
        import('./ConfigSaveButton').then(module => module.default),
        import('./route_files/RouteIdlewatcherSection').then(
          module => module.RouteIdlewatcherSection
        ),
      ])
    getFile.mockClear()
    getFile.mockImplementation(async () => ({ data: stringifyYAML(initialConfig) }))
    validateFile.mockClear()
    setFile.mockClear()
    savedRoute = undefined
    configStore.activeFile.set({ type: 'config', filename: 'config.yml' })
    configStore.content.set('')
    configStore.configObject.reset()
    configStore.originalConfig.reset()
    configStore.validateError.reset()
    container = dom.window.document.createElement('div')
    dom.window.document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    dom.window.close()
  })

  test('saves selected, all, and disabled defaults without changing unrelated config', async () => {
    await act(async () =>
      root.render(
        <>
          <ConfigStateSyncronizer />
          <DefaultValues />
          <ConfigSaveButton aria-label="Save" />
        </>
      )
    )
    await waitUntil(() => configStore.originalConfig.value !== undefined)
    expect(configStore.configObject.value?.defaults?.idlewatcher).toBeUndefined()
    await chooseMode('Selected providers')
    await chooseProvider('gotify')
    expect(await saveConfig()).toEqual(expectedConfig({ to: ['Discord (webhook)', 'gotify'] }))
    await chooseMode('All providers')
    expect(await saveConfig()).toEqual(expectedConfig({}))
    await chooseMode('Disabled')
    expect(await saveConfig()).toEqual(expectedConfig({ to: [] }))
    expect(validateFile).toHaveBeenCalled()
  })

  test('preserves explicit route opt-outs and restores inheritance when selected', async () => {
    const route = {
      ...initialRoute,
      idlewatcher: { ...initialRoute.idlewatcher!, notify: { to: [] } },
    }
    configStore.activeFile.set({ type: 'provider', filename: 'routes.yml' })
    await act(async () => root.render(<RouteEditor route={route} onSave={saveRouteValues} />))
    await waitUntil(() => getFile.mock.calls.length > 0)
    expect(getFile).toHaveBeenCalledWith(
      { type: 'config', filename: 'config.yml' },
      expect.objectContaining({ format: 'text' })
    )
    expect(
      getByRole(container, 'combobox', { name: 'Sleep/wake notifications' }).textContent
    ).toContain('Disabled')
    await saveRoute()
    expect(savedRoute).toEqual(route)
    await chooseMode('Selected providers')
    await saveRoute()
    expect(savedRoute?.idlewatcher?.notify).toEqual({ to: ['Discord (webhook)'] })
    await chooseMode('Use defaults')
    await saveRoute()
    expect(savedRoute).toEqual(initialRoute)
  })

  test('opening an inherited route does not opt it in or change its idle timeout', async () => {
    await act(async () =>
      root.render(<RouteEditor route={initialRoute} onSave={saveRouteValues} />)
    )
    expect(
      getByRole(container, 'combobox', { name: 'Sleep/wake notifications' }).textContent
    ).toContain('Use defaults')
    await saveRoute()
    expect(savedRoute).toEqual(initialRoute)
  })

  test('retains unlisted targets during catalog failure and can retry without losing them', async () => {
    getFile.mockImplementation(async () => {
      throw new Error('unavailable')
    })
    const route = {
      ...initialRoute,
      idlewatcher: { ...initialRoute.idlewatcher!, notify: { to: ['old provider'] } },
    }
    await act(async () => root.render(<RouteEditor route={route} onSave={saveRouteValues} />))
    await waitUntil(() => queryByRole(container, 'alert') !== null)
    expect(getByText(container, 'old provider')).toBeDefined()
    await saveRoute()
    expect(savedRoute).toEqual(route)
    getFile.mockImplementation(async () => ({ data: stringifyYAML(initialConfig) }))
    await act(async () => fireEvent.click(getByRole(container, 'button', { name: 'Retry' })))
    await waitUntil(() => queryByRole(container, 'alert') === null)
    await openProviders()
    expect(
      getByRole(dom.window.document.body, 'option', { name: 'Discord (webhook)' })
    ).toBeDefined()
    await act(async () =>
      fireEvent.keyDown(getByRole(container, 'combobox', { name: 'Notification providers' }), {
        key: 'Escape',
      })
    )
    expect(queryByRole(container, 'alert')).toBeNull()
    await saveRoute()
    expect(savedRoute).toEqual(route)
  })
})

async function chooseMode(name: string) {
  await act(async () =>
    fireEvent.click(getByRole(container, 'combobox', { name: 'Sleep/wake notifications' }))
  )
  await act(async () => {
    const option = getByRole(dom.window.document.body, 'option', { name })
    fireEvent.pointerDown(option, { pointerType: 'mouse' })
    fireEvent.click(option)
  })
}

async function chooseProvider(name: string) {
  const input = await openProviders()
  await act(async () => {
    const option = getByRole(dom.window.document.body, 'option', { name })
    fireEvent.pointerDown(option, { pointerType: 'mouse' })
    fireEvent.click(option)
  })
  await act(async () => fireEvent.keyDown(input, { key: 'Escape' }))
}

async function openProviders() {
  const input = getByRole(container, 'combobox', { name: 'Notification providers' })
  await act(async () => {
    input.focus()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
  })
  return input
}

function expectedConfig(notify: { to?: string[] }) {
  return {
    ...initialConfig,
    defaults: { ...initialConfig.defaults, idlewatcher: { notify } },
  }
}

function saveRouteValues(values: ReverseProxyRoute) {
  savedRoute = parseYAML(stringifyYAML(values)) as ReverseProxyRoute
}

async function saveConfig() {
  setFile.mockClear()
  await act(async () => fireEvent.click(getByRole(container, 'button', { name: 'Save' })))
  expect(setFile).toHaveBeenCalledTimes(1)
  return parseYAML(setFile.mock.calls[0]?.[1] ?? '') as Config
}

async function saveRoute() {
  await act(async () => fireEvent.click(getByRole(container, 'button', { name: 'Save route' })))
}

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }
  throw new Error('Timed out waiting for the notification editor')
}
