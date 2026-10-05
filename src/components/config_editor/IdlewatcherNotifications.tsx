import { RenderWithUpdate, type ValueState } from 'juststore'
import { useId } from 'react'
import { useAsyncRetry } from 'react-use'
import { parse as parseYAML } from 'yaml'
import { StoreMultiSelectField } from '@/components/store/MultiSelect'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api, useEndpoint } from '@/lib/api-client'
import type { Config } from '@/types/godoxy/config/config'
import type { IdleWatcherNotifyConfig } from '@/types/godoxy/providers/idlewatcher'

type IdlewatcherNotificationsProps = {
  state: Pick<
    ValueState<{ notify?: IdleWatcherNotifyConfig } | undefined>,
    'use' | 'set' | 'value' | 'derived'
  >
  inherit?: boolean
  providerNames?: string[]
}

export function IdlewatcherNotifications({
  state,
  inherit = false,
  providerNames,
}: IdlewatcherNotificationsProps) {
  const id = useId()
  const endpoint = useEndpoint(api.file.get)
  const catalog = useAsyncRetry(async () => {
    if (providerNames !== undefined) return
    const response = await endpoint.get(
      { type: 'config', filename: 'config.yml' },
      { format: 'text' }
    )
    const config = parseYAML(response.data) as Config | null
    return config?.providers?.notification?.map(provider => provider.name) ?? []
  }, [providerNames])

  return (
    <RenderWithUpdate state={state}>
      {(config, setConfig) => {
        const notify = config?.notify
        const setNotify = (nextNotify: IdleWatcherNotifyConfig | undefined) =>
          setConfig({ ...config, notify: nextNotify })
        const names = [
          ...new Set([...(providerNames ?? catalog.value ?? []), ...(notify?.to ?? [])]),
        ]
        const mode =
          notify?.to != null
            ? notify.to.length === 0
              ? 'disabled'
              : 'selected'
            : inherit
              ? 'inherit'
              : notify
                ? 'all'
                : 'disabled'
        const modes = {
          ...(inherit ? { inherit: 'Use defaults' } : { all: 'All providers' }),
          disabled: 'Disabled',
          ...(names.length > 0 ? { selected: 'Selected providers' } : {}),
        }

        return (
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={id}>Sleep/wake notifications</FieldLabel>
              <Select
                value={mode}
                items={modes}
                onValueChange={value => {
                  if (value === 'inherit') setNotify(undefined)
                  else if (value === 'disabled') setNotify({ to: [] })
                  else if (value === 'all') setNotify({})
                  else if (value === 'selected' && names[0]) setNotify({ to: [names[0]] })
                }}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modes).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Send notifications when a resource sleeps, pauses, or begins waking up. Requires an
                idle timeout.
                {inherit && ' Use defaults follows the settings in Default Values.'}
              </FieldDescription>
            </Field>
            {mode === 'selected' && (
              <StoreMultiSelectField
                title="Notification providers"
                aria-label="Notification providers"
                options={names.map(name => ({ value: name, label: name }))}
                state={state.derived({
                  from: current => current?.notify?.to ?? [],
                  to: to => ({ ...state.value, notify: { to } }),
                })}
              />
            )}
            {catalog.error ? (
              <FieldDescription role="alert">
                Could not load notification providers.{' '}
                <Button type="button" variant="link" size="sm" onClick={catalog.retry}>
                  Retry
                </Button>
              </FieldDescription>
            ) : providerNames === undefined && catalog.loading ? (
              <FieldDescription>Loading notification providers…</FieldDescription>
            ) : names.length === 0 ? (
              <FieldDescription>
                Add a provider in Configuration → Notifications to select targets.
              </FieldDescription>
            ) : null}
          </FieldGroup>
        )
      }}
    </RenderWithUpdate>
  )
}
