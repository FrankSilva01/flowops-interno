# Exportacao direta para Shopee

## Objetivo

Permitir que o cliente selecione anuncios e gere, com um clique, uma planilha
XLSX pronta para importacao em massa na Shopee. O cliente nao precisa baixar nem
reenviar um modelo vazio da Shopee.

## Fluxo

1. O cliente seleciona um ou mais anuncios.
2. O FlowOps mostra quantos anuncios estao prontos e quais possuem pendencias.
3. O cliente informa a categoria Shopee e valores de embalagem apenas quando os
   dados nao existirem no anuncio de origem.
4. O FlowOps valida titulo, preco, estoque, SKU, imagens, categoria, peso,
   comprimento, largura, altura e marca.
5. O botao gera e baixa
   `FLOWOPS_SHOPEE_<quantidade>_ANUNCIOS.xlsx`.

## Esquema da planilha

O gerador cria internamente uma pasta de trabalho com uma aba `Modelo`, as
linhas de metadados esperadas pelo importador em massa e os produtos a partir da
linha 7. O esquema inclui:

- categoria Shopee;
- titulo e descricao;
- SKU pai e SKU do item;
- preco e estoque;
- imagem principal e imagens adicionais;
- peso em quilogramas;
- comprimento, largura e altura em centimetros;
- marca;
- prazo de postagem;
- canal logistico habilitado.

O esquema fica versionado no codigo e coberto por testes, para evitar depender
de arquivos locais do navegador.

## Origem e precedencia dos dados

Peso, dimensoes e marca usam esta ordem:

1. dados estruturados do anuncio;
2. atributos do Mercado Livre;
3. valores padrao informados no formulario.

A marca usa `Sem marca` somente quando nao houver uma marca real no anuncio e
nenhum valor manual tiver sido informado.

## Validacao e erros

O download e bloqueado quando um produto pronto para exportacao ainda nao tiver
um campo obrigatorio. A mensagem informa o nome do produto e o campo ausente.
Anuncios sem titulo, preco ou tres imagens continuam fora do lote.

O botao nao depende mais de um campo de upload. Seu estado depende apenas de
haver pelo menos um anuncio valido e de todos os campos obrigatorios do lote
estarem preenchidos.

## Cadastro de produtos

A regra de titulo do Mercado Livre continua protegendo a publicacao, mas passa a
ser exibida junto ao campo de nome antes de o usuario chegar ao passo de
marketplace. Salvar somente no catalogo interno nao e bloqueado por essa regra.

## Testes

- teste unitario do esquema e das linhas XLSX geradas;
- teste de precedencia entre atributos do anuncio e valores do formulario;
- teste de peso, comprimento, largura, altura e marca;
- teste de bloqueio por campo obrigatorio ausente;
- teste E2E confirmando que o botao gera o download sem upload de modelo;
- teste do cadastro local com titulo curto e da publicacao ML com titulo
  incompleto.
