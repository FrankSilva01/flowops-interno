# Cadastro público e imagens da landing page

## Objetivo

Restaurar as capturas do sistema na landing page publicada em `lively-figolla-c41308.netlify.app` e permitir que novos clientes criem uma empresa em qualquer plano sem informar cartão durante o cadastro.

## Estado atual e causas confirmadas

- A landing page referencia `assets/flowops-dashboard.png`, `assets/flowops-producao.png` e `assets/flowops-encomendas.png`, mas os três caminhos retornam HTTP 404 porque os arquivos não fazem parte do deploy.
- A landing chama `public-onboarding` para listar planos e registrar empresas. A função está configurada com `verify_jwt = true`, portanto uma visita anônima recebe HTTP 401 antes de o código da função executar.
- O código interno da função já possui validação de campos, controle de duplicidade e limites por e-mail e IP. A função foi projetada para cadastro público, mas a configuração de gateway contradiz esse desenho.

## Comportamento desejado

### Imagens

- A landing deve conter três imagens reais do FlowOps: dashboard, produção e encomendas.
- Os nomes e caminhos existentes serão preservados para evitar alterações desnecessárias no HTML e nos metadados sociais.
- As imagens serão otimizadas para web sem tornar textos e indicadores ilegíveis.
- O deploy será validado exigindo HTTP 200 e tipo de conteúdo de imagem para cada arquivo.

### Planos e cadastro

- A listagem pública de planos e a ação de registro devem funcionar sem sessão prévia.
- O plano gratuito cria organização e assinatura ativas imediatamente.
- Um plano pago cria a organização em período de teste, sem exigir cartão.
- Após o cadastro em plano pago, o usuário pode iniciar o checkout do Mercado Pago ou fazê-lo posteriormente em Minha Assinatura.
- O plano Enterprise continua direcionando para atendimento comercial e não cria conta automaticamente.
- E-mail já existente deve continuar retornando mensagem orientando o usuário a entrar.

## Segurança

- `public-onboarding` será implantada sem verificação JWT no gateway, porque autenticação prévia é incompatível com criação pública de conta.
- A função continuará usando chave administrativa somente no servidor; nenhuma chave privilegiada será enviada ao navegador.
- Permanecem obrigatórios: validação de entrada, aceite dos termos, senha mínima, plano ativo, controle de duplicidade, limite por e-mail e limite por IP.
- Respostas não devem revelar detalhes internos do banco ou credenciais.

## Estrutura e fonte de deploy

- A landing page passará a ter uma fonte versionada no repositório, contendo HTML, CSS, JavaScript, configuração pública e imagens.
- O artefato publicado na Netlify será gerado dessa fonte versionada, eliminando a dependência de arquivos presentes apenas em um deploy manual anterior.
- A função `public-onboarding` continuará no diretório Supabase já existente e será implantada com a configuração pública correta.

## Tratamento de erros

- Se os planos não puderem ser carregados, a landing mostrará uma mensagem acionável e uma opção para tentar novamente, sem deixar a seção permanentemente vazia.
- Durante o envio, o botão de cadastro ficará desabilitado para evitar duplicidade e será reativado em caso de falha.
- Falha ao abrir o checkout não desfaz uma conta criada; o usuário recebe instrução para ativar a assinatura depois.

## Testes e validação

- Teste de configuração garante que `public-onboarding` seja pública e que funções privadas permaneçam protegidas.
- Testes da função cobrem listagem anônima, plano gratuito, trial pago, Enterprise, e-mail duplicado e rate limit.
- Teste da landing verifica que todos os caminhos de imagens existem no artefato.
- Teste de navegador confirma carregamento dos planos e abertura do formulário de cadastro.
- Em produção, serão verificados os três arquivos de imagem, a resposta pública da listagem de planos e o fluxo de cadastro até a validação do formulário, sem criar conta descartável desnecessária.

## Publicação e reversão

- As alterações serão commitadas e enviadas ao repositório antes do deploy.
- A função Supabase será publicada primeiro; em seguida, a landing será publicada na Netlify.
- A validação pós-deploy deverá ocorrer antes de considerar a mudança concluída.
- Se houver regressão, a Netlify poderá restaurar o deploy anterior e a função poderá ser reimplantada com a versão anterior.
