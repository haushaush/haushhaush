import { SlackChannelsTab } from '@/components/settings/SlackChannelsTab';
import { SlackListsTab } from '@/components/settings/SlackListsTab';
import { SlackWebhookConfig } from '@/components/settings/SlackWebhookConfig';

export default function SlackPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Slack</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Slack-Channels, Listen und Webhooks verwalten.
        </p>
      </div>

      <SlackChannelsTab />
      <SlackListsTab />
      <SlackWebhookConfig />
    </div>
  );
}
