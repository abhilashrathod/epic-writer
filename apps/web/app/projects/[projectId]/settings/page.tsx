import { AiSettings } from '../../../../components/AiSettings';
import { BackupSettings } from '../../../../components/BackupSettings';
import { ProjectSettings } from '../../../../components/settings/ProjectSettings';

export default function ProjectSettingsPage() {
  return (
    <>
      <ProjectSettings />
      <AiSettings />
      <BackupSettings />
    </>
  );
}
