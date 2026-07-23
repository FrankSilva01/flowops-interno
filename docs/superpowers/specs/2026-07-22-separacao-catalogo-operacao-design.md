# Separação entre Catálogo e Operação no Marketplace

## Objetivo

Separar claramente o cadastro mestre de produtos da atividade operacional dos marketplaces. O Catálogo deve responder "o que a empresa vende"; a Operação deve responder "onde e como cada produto está sendo vendido".

## Modelo de domínio

- `products` é a fonte do cadastro mestre: SKU, nome, categoria, custo, peso, descrição e arquivos de produção.
- `product_listings` representa o vínculo entre um produto mestre e um anúncio externo.
- `marketplaceListings` representa anúncios e publicações por canal, com estado operacional, preço, estoque e métricas.
- Registros de vitrine não devem ser tratados como anúncios operacionais.
- Anúncios antigos sem `product_listings` continuam acessíveis na Operação e recebem indicação de que não possuem produto mestre vinculado.

## Experiência do Catálogo

A área Catálogo exibirá os registros de `state.products`. Cada produto mostrará, no mínimo, SKU, nome, categoria, custo e anúncios vinculados. A ação principal será `Cadastrar produto`, reutilizando o cadastro interno existente, em vez de manter um segundo formulário concorrente.

Produtos sem anúncio permanecem no Catálogo e são identificados como não publicados. Produtos vinculados exibem os canais correspondentes e permitem chegar ao anúncio relacionado. A vitrine pública continuará sendo um destino de publicação, mas não definirá sozinha a existência do produto mestre.

## Experiência da Operação

A área Operação manterá as visões `Anúncios`, `Vendas` e `Perguntas`. A lista de Anúncios mostrará apenas registros de canais de marketplace; publicações exclusivas da vitrine serão excluídas dessa visão.

O botão duplicado `Cadastrar produto` será substituído por `Criar anúncio a partir do catálogo`. A ação levará o usuário ao Catálogo, onde ele poderá selecionar ou cadastrar o produto mestre antes de publicar.

Os indicadores operacionais serão calculados sobre o mesmo conjunto filtrado de anúncios exibidos, evitando que itens exclusivos da vitrine alterem quantidade, estoque, problemas ou desempenho dos canais.

## Navegação e estados vazios

- A troca entre Operação e Catálogo continuará usando as abas existentes.
- `Criar anúncio a partir do catálogo` abrirá a área Catálogo e deixará evidente o próximo passo.
- O Catálogo vazio orientará o usuário a cadastrar o primeiro produto.
- A Operação vazia orientará o usuário a conectar/sincronizar um marketplace ou criar uma publicação a partir do Catálogo.
- Filtros de canal serão aplicados somente às visões para as quais tenham efeito real; não devem sugerir que o cadastro mestre pertence a um único marketplace.

## Compatibilidade e persistência

Não será criada migração de banco de dados. A implementação aproveitará `products` e `product_listings`, que já são carregadas pelo aplicativo. Nenhum anúncio legado será excluído ou convertido automaticamente.

Quando não houver produto mestre vinculado, a interface preservará o anúncio e mostrará a pendência. A separação será introduzida de forma compatível com os dados atuais.

## Testes e critérios de aceite

- A classificação distingue anúncio operacional de publicação exclusiva da vitrine.
- O Catálogo usa produtos mestres, e não a lista bruta de anúncios.
- A Operação não inclui registros exclusivos da vitrine em listas ou indicadores.
- O Catálogo mostra os vínculos existentes em `product_listings`.
- A ação principal da Operação navega ao Catálogo e não abre um cadastro duplicado.
- A navegação entre áreas continua selecionando as subvisões corretas.
- Anúncios legados sem vínculo continuam visíveis e são identificados como pendentes de associação.
- A suíte automatizada existente permanece verde.

## Fora de escopo

- Migração automática de anúncios legados para produtos mestres.
- Alteração do esquema do Supabase.
- Exclusão da vitrine pública ou das métricas de visualização e clique.
- Publicação em produção ou alteração de configuração da Netlify nesta etapa de implementação.
