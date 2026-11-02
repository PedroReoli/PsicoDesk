/* eslint-disable react-hooks/set-state-in-effect -- O efeito dispara uma consulta assíncrona; o estado é atualizado pelo ciclo da operação. */
import { useCallback, useEffect, useState } from 'react';
import { useAuthSession } from '../../auth/hooks/useAuthSession';
import { documentsService } from '../services/documents.service';
import type { ClinicDocument, GenerateDocumentInput } from '../types/document.types';
export function useDocuments(patientId: string) {
  const { session } = useAuthSession();
  const [documents, setDocuments] = useState<ClinicDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      setDocuments(await documentsService.list(session.token, patientId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  }, [session, patientId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function generate(input: GenerateDocumentInput) {
    if (!session) throw new Error('Sessão expirada.');
    const document = await documentsService.generate(session.token, input);
    setDocuments((current) => [document, ...current]);
  }
  async function exportDocument(documentId: string) {
    if (!session) throw new Error('Sessão expirada.');
    return documentsService.export(session.token, documentId);
  }
  return { documents, loading, error, reload: load, generate, exportDocument };
}
