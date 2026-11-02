# Prontidão de produção

Este documento separa o que é comprovado localmente do que depende de ambiente, fornecedor ou aceite externo. Ele não substitui homologação clínica, jurídica ou operacional.

## Arquitetura validada

- O desktop é local-first: com a sincronização desabilitada, pacientes, agenda, prontuário, financeiro, documentos, relatórios, usuários, auditoria e backups não dependem da API ou do mobile.
- Desktop e mobile produzem e consomem o contrato canônico de `/v1/batches`, com AES-256-GCM para conteúdo, Ed25519 para assinatura, cursor de leitura e ACK idempotente.
- A API autentica clínica e dispositivo, transporta envelopes opacos e fornece tickets WebSocket efêmeros. Ela não recebe chaves privadas, a chave simétrica de sincronização nem conteúdo clínico legível.
- O mobile mantém chaves no SecureStore, projeções cifradas no SQLite e aplica inbox/projeção antes de emitir o ACK estável.
- O desktop mantém banco SQLCipher e segredos protegidos por DPAPI, permite recuperação do Owner por código descartável e exporta backup portátil cifrado por senha independente da máquina.

## Evidência e limitações

| Afirmação                     | Evidência local                                                 | Estado                            | Limitação                                                 |
| ----------------------------- | --------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Protocolo compartilhado       | Testes do pacote `sync-protocol` e testes dos clientes          | Validado em código                | Sem teste em rede pública                                 |
| Mobile conversa com API       | Testes E2E HTTP contra Fastify real em porta efêmera            | Validado localmente               | Sem aparelho físico/iOS                                   |
| Desktop conversa com API      | Testes do cliente, autenticação, batches, ACK e ticket realtime | Validado localmente               | Sem PostgreSQL/S3 reais                                   |
| Desktop funciona sem internet | Sync opt-in e fluxos locais cobertos pelo backend Rust          | Validado localmente               | Homologação instalada ainda depende do Windows de destino |
| Continuidade de dados         | Backup interno, rollback e backup portátil cifrado              | Validado por testes automatizados | Exige rotina off-site do cliente                          |
| Distribuição Windows          | MSI e NSIS podem ser gerados pelo Tauri                         | Executável localmente             | Sem certificado Authenticode; pode haver SmartScreen      |
| Uso clínico real              | Regras de acesso, auditoria e imutabilidade implementadas       | Implementado                      | Revisão clínica, LGPD e jurídica pendentes                |

## Checklist do primeiro cliente local

1. Instalar em um Windows dedicado e manter a sincronização desabilitada até a infraestrutura remota ser homologada.
2. Criar o Owner e um segundo administrador operacional; conferir papéis e permissões de todos os usuários.
3. Gerar o código de recuperação do Owner, guardar fora do computador e confirmar que ele não ficou salvo em texto legível no aplicativo.
4. Exportar um backup portátil com senha forte, armazená-lo em mídia ou cofre externo e ensaiar a restauração em ambiente separado.
5. Executar o fluxo de aceite: paciente, agenda, prontuário/adendo, financeiro, documento, relatório, backup e restauração.
6. Registrar formalmente o aceite do risco de instalador sem assinatura Authenticode ou adquirir um certificado antes da distribuição.
7. Obter revisão clínica, LGPD e jurídica antes de cadastrar dados reais.

## Rollback

Antes de uma restauração portátil, o desktop cria um backup interno de segurança. Se a importação falhar, tenta restaurar esse backup e não avança a operação. Para uma atualização de versão, preserve também uma cópia portátil externa e mantenha o instalador anterior até concluir o aceite.
