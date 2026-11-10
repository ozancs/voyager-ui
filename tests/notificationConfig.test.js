import { describe, it, expect } from 'vitest';
import { notificationEntries, updateIniSection, discoverNotificationConfigs } from '../src/notificationConfig';
describe('notification config ownership', () => {
  it('finds independent Telegram bots and notifier sections with their source', () => {
    const entries = notificationEntries(
      '[bot]\nbot_token = test-token\nchat_id: -10042\n[notifier phone]\nurl: tgram://test-token/42\nevents: complete, error\n',
      'nested/telegram.conf',
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      external: true,
      token: 'test-token',
      chat: '-10042',
      path: 'nested/telegram.conf',
    });
    expect(entries[1]).toMatchObject({ name: 'phone', events: ['complete', 'error'] });
  });
  it('preserves other options, templates, comments, sections and CRLF', () => {
    const text =
      '[bot]\r\nserver: localhost\r\nbot_token = old\r\n# explanation\r\nchat_id: 42\r\n[telegram_ui]\r\nbuttons: [{foo}]\r\n';
    expect(updateIniSection(text, 'bot', { bot_token: 'new', chat_id: '84' })).toBe(
      text.replace('= old', '= new').replace('chat_id: 42', 'chat_id: 84'),
    );
  });
  it('replaces multiline fields without touching message templates', () => {
    const text =
      '[notifier phone]\nurl: tgram://a/1\nevents:\n  complete\n  error\nbody: {event_args[1].filename}\n[server]\nhost: 0.0.0.0\n';
    const result = updateIniSection(text, 'notifier phone', { events: 'paused' });
    expect(result).toContain('events:paused');
    expect(result).not.toContain('  complete');
    expect(result).toContain('body: {event_args[1].filename}');
    expect(result).toContain('[server]\nhost: 0.0.0.0');
  });
  it('rejects section injection and stale section names', () => {
    expect(() => updateIniSection('[bot]\nchat_id: 1', 'bot', { chat_id: '2\n[server]' })).toThrow();
    expect(() => updateIniSection('[bot]\n', 'missing', { chat_id: '2' })).toThrow();
  });
  it('scans nested configs but ignores backup files and folders', async () => {
    const read = [];
    const api = {
      call: async (_, { path }) =>
        path === 'config'
          ? {
              files: [{ filename: 'moonraker.conf' }, { filename: 'telegram.conf.bak' }],
              dirs: [{ dirname: 'bots' }, { dirname: 'backups' }],
            }
          : { files: [{ filename: 'telegram.conf' }], dirs: [] },
      getText: async (path) => {
        read.push(path);
        return path.includes('telegram') ? '[bot]\nbot_token: test\nchat_id: 42' : '[server]\n';
      },
    };
    const result = await discoverNotificationConfigs(api);
    expect(result.entries[0].path).toBe('bots/telegram.conf');
    expect(read).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });
});
