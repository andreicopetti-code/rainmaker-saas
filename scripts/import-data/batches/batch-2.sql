DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'BRAZUL TRANSPORTE DE VEICULOS LTDA', 'BRAZUL TRANSPORTES',
    '60395589002220', 'cscfiscal.cadastro@sada.com.br', '(31) 3071-0700',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'BRAZUL TRANSPORTES', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CATSUL GUAIBA - TRANSPORTES HIDROVIARIOS LTDA', 'CATSUL GUAIBA - TRANSPORTES HIDROVIARIOS LTDA',
    '12998170000277', 'ivan.didio@ouroeprata.com', '(51) 3375-8561',
    'Hugo Eugênio Fleck', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Hugo Eugênio Fleck","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CATSUL GUAIBA - TRANSPORTES HIDROVIARIOS LTDA', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'COOPERATIVA CENTRAL GAUCHA LTDA', 'CCGL',
    '88933114003150', 'marcelo@ccgl.com.br', '(55) 3321-9400',
    'Caio Cézar Vianna', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Caio Cézar Vianna","municipio":"SANTA ROSA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CCGL', 'QUALIFICADO',
    NULL, 25, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"E","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CHLORUM BRASIL INDUSTRIA LTDA', 'CHLORUM BR',
    '20034081000239', NULL, '(11) 2307-3955',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CHLORUM BR', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'COMERCIAL ZAFFARI LTDA', 'Comercial Zaffari',
    '92016757000191', 'gmatto.s@zaffarinet.com.br', '(54) 3100-0076',
    'SERGIO ZAFFARI', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"SERGIO ZAFFARI","municipio":"PASSO FUNDO","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'Comercial Zaffari', 'REUNIÃO',
    NULL, 45, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"E","lead_source":null}'::jsonb
  );
END $$;