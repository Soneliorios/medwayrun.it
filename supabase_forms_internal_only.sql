-- Ajuste #5: formulários passam a ser SEMPRE internos.
-- Só usuários logados podem enviar, e a tarefa gerada é criada em nome de
-- quem enviou (created_by). Aqui forçamos todo formulário já existente a
-- acesso interno, removendo qualquer link público/externo.
update public.forms
set external_access = false,
    internal_access = true
where external_access is distinct from false
   or internal_access is distinct from true;
