import { StoreMapInput } from '@/components/form/StoreMapInput'
import { FormContainer } from '@/components/form/FormContainer'
import { ConfigSchema } from '@/types/godoxy'
import { IdlewatcherNotifications } from '../IdlewatcherNotifications'
import { configStore } from '../store'

export default function DefaultValues() {
  const providerNames = configStore.configObject.providers.notification.useCompute(
    providers => providers?.map(provider => provider.name) ?? []
  )

  return (
    <div className="flex flex-col gap-6">
      <StoreMapInput
        label="Health Check"
        state={configStore.configObject.defaults.healthcheck.ensureObject()}
        schema={ConfigSchema.properties.defaults.properties.healthcheck}
      />
      <FormContainer label="Idle Sleep Notifications" grid={false}>
        <IdlewatcherNotifications
          state={configStore.configObject.defaults.idlewatcher}
          providerNames={providerNames}
        />
      </FormContainer>
    </div>
  )
}
