DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'AFRY BRASIL LTDA.', 'AFRY BRASIL',
    '50648468003008', 'rogerio.arriel@poyry.com.br', '(11) 3472-6357',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'AFRY BRASIL', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'ALIMENTTA RESTAURANTES EMPRESARIAIS LTDA', 'ALIMENTTA',
    '09430324009271', 'gilnei@alimentta.net', '(51) 3371-2180',
    'Marcelo de Carvalho Heineck', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Marcelo de Carvalho Heineck","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'ALIMENTTA', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'ANDRITZ BRASIL LTDA', 'ANDRITZ BR',
    '62420534001600', 'abl.cadastro@andritz.com', '(41) 2103-7665',
    'Luiz Mário Bordini', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Luiz Mário Bordini","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'ANDRITZ BR', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'AUTOPORT TRANSPORTES E LOGISTICA LTDA.', 'AUTOPORT',
    '07677731001944', NULL, '(27) 2125-1800',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'AUTOPORT', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'BBM LOGISTICA S.A', 'BBM LOGISTICA',
    '01107327000391', 'regulatorio@bbmlogistica.com.br', '(41) 2169-0055',
    'Marcos Battistela', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Marcos Battistela","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'BBM LOGISTICA', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;