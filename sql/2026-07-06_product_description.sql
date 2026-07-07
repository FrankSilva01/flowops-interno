-- Adiciona a coluna de descricao ao catalogo de produtos (campo novo no
-- cadastro rapido de produto, usado tambem como descricao real ao publicar
-- no Mercado Livre em vez de reaproveitar so o nome do produto).
--
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase (numa
-- query nova) e rode. E seguro rodar mais de uma vez (add column if not exists).

alter table public.products
  add column if not exists description text;
