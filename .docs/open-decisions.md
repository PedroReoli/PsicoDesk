# Decisões em aberto

Este documento reúne decisões que precisam de validação antes de transformar o SDD em implementação. Nenhum item abaixo deve ser tratado como decidido por inferência.

## Produto e identidade

1. Qual é o nome canônico: `PsicoDesk`, `PsychoDesk` ou `SicoDesk`? O diretório, o SDD e o cabeçalho da referência visual divergem.
2. A imagem anexada é apenas referência conceitual ou contrato visual a ser reproduzido com fidelidade?
3. Qual é o recorte da primeira entrega: fundação técnica, protótipo navegável ou MVP funcional com persistência?

## Descoberta e operação clínica

4. As entrevistas com psicólogos, recepção e administração da Fase 0 já ocorreram? Se sim, onde estão as evidências e decisões resultantes?
5. Qual é a matriz inicial de papéis e permissões, inclusive para proprietário da clínica, administrador, recepção, psicólogo e financeiro?
6. Quais campos, documentos, assinaturas, adendos e fluxos são obrigatórios na prática clínica escolhida para o piloto?
7. Quais regras de retenção, correção, exportação e eliminação foram validadas com assessoria jurídica e normas profissionais vigentes?

## Segurança e continuidade

8. Qual estratégia será adotada para criptografia e recuperação: SQLCipher, criptografia por campo/anexo ou modelo híbrido?
9. Como ocorrerão criação, proteção, rotação, recuperação e perda das chaves em um computador offline?
10. Qual é a política de sessão local, recuperação de acesso e bloqueio por tentativas em computadores compartilhados?
11. Onde os backups serão armazenados e quais são os objetivos de recuperação e perda aceitável de dados?

## Arquitetura e distribuição

12. A instalação será por usuário ou por máquina, e quais privilégios administrativos poderão ser exigidos?
13. O primeiro piloto funcionará em um único computador? Se houver múltiplos PCs, qual instância será proprietária de cada registro?
14. O intercâmbio de cargas e a API opcional fazem parte do MVP ou de uma fase posterior isolada?
15. Qual será o modelo de licenciamento offline e o comportamento durante indisponibilidade prolongada?
16. A proibição de modais inclui seletores nativos do Windows e prompts inevitáveis do sistema, ou apenas interfaces de formulário construídas pela aplicação?

## Repositório remoto

17. O repositório deve permanecer apenas local ou ser publicado no GitHub? Para publicação faltam organização/conta de destino e visibilidade pública ou privada.
