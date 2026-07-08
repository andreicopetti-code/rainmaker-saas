DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'EXPRESSO NEPOMUCENO S/A', 'EXPRESSO NEPOBUCENO',
    '19368927004447', 'tributario@expressonepomucemo.com.br', '(35) 3694-9896',
    'Agnésio Carvalho de Souza', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Agnésio Carvalho de Souza","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'EXPRESSO NEPOBUCENO', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'GERDAU ACOS LONGOS S.A.', 'GERDAU',
    '07358761020437', 'cpg-dteicms@gerdau.com.br', '(11) 3094-6600',
    'Gustavo Werneck', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Gustavo Werneck","municipio":"PORTO ALEGRE","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'GERDAU', 'REUNIÃO',
    NULL, 45, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"E","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'MASAL S A INDUSTRIA E COMERCIO', 'MASAL',
    '96299219000102', 'masal@masal.com.br', NULL,
    'Cláudio Bier', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Cláudio Bier","municipio":"SANTO ANTONIO DA PATRULHA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'MASAL', 'QUALIFICADO',
    NULL, 25, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'Grupo Meridian', 'Meridian',
    NULL, 'rlopes@meridian.com', '(51) 3233-1122',
    'Roberto Lopes', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Roberto Lopes","municipio":"São Paulo","uf":"SP"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'Meridian', 'PROPOSTA_ENVIADA',
    NULL, 65, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'NORTEL SUPRIMENTOS INDUSTRIAIS LTDA', 'NORTEL SUPRIMENTOS',
    '46044053010500', 'juridico.tributario@sonepar.com.br', '(19) 2102-7700',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'NORTEL SUPRIMENTOS', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;