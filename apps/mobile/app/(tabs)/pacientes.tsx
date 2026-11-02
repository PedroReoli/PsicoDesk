import { ProjectionScreen } from '../../src/components/ProjectionScreen';
export default function PatientsScreen() {
  return (
    <ProjectionScreen
      entity="patient"
      title="Pacientes"
      description="Projeção local cifrada, somente leitura."
      emptyTitle="Nenhum paciente sincronizado"
    />
  );
}
