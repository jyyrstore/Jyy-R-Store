const repo=require('../../repositories/categories.repository');
const slug=require('../../utils/slug');
const {badRequest,notFound}=require('../../utils/error');

async function resolveParent(parentId,excludeId=null){
  const value=String(parentId||'').trim();
  if(!value)return null;

  if(String(excludeId||'')===value){
    throw badRequest(
      'CATEGORY_PARENT_INVALID',
      'Kategori tidak dapat menjadi induk dirinya sendiri.'
    );
  }

  const parent=await repo.findById(value);

  if(!parent){
    throw badRequest(
      'CATEGORY_PARENT_NOT_FOUND',
      'Kategori induk tidak ditemukan.'
    );
  }

  if(parent.parent_id){
    throw badRequest(
      'CATEGORY_DEPTH_LIMIT',
      'Subkategori hanya boleh memiliki dua level kategori.'
    );
  }

  return value;
}

async function create(data){
  const subcategory=String(data.subcategory||'').trim();

  if(subcategory){
    return repo.createWithSubcategory({
      ...data,
      subcategory,
      slug:slug(data.slug||data.name),
      subcategory_slug:slug(subcategory)
    });
  }

  const parent_id=await resolveParent(data.parent_id);

  return repo.create({
    ...data,
    parent_id,
    slug:slug(data.slug||data.name)
  });
}

async function update(id,data){
  const current=await repo.findById(id);

  if(!current){
    throw notFound('Kategori tidak ditemukan.');
  }

  const hasSubcategory=Object.prototype.hasOwnProperty.call(data,'subcategory');
  const subcategory=String(data.subcategory||'').trim();

  if(hasSubcategory&&current.parent_id){
    if(!subcategory){
      throw badRequest(
        'CATEGORY_SUBCATEGORY_REQUIRED',
        'Nama subkategori wajib diisi.'
      );
    }

    const parent=await repo.findById(current.parent_id);

    if(!parent){
      throw notFound('Kategori induk tidak ditemukan.');
    }

    return repo.updateHierarchy(parent.id,current.id,{
      name:data.name,
      slug:slug(data.slug||parent.slug||parent.name),
      subcategory,
      subcategory_slug:slug(subcategory),
      is_active:data.is_active
    });
  }

  if(hasSubcategory&&subcategory){
    return repo.updateWithSubcategory(id,{
      ...data,
      subcategory,
      slug:slug(data.slug||data.name||current.name),
      subcategory_slug:slug(subcategory)
    });
  }

  const parent_id=Object.prototype.hasOwnProperty.call(data,'parent_id')
    ? await resolveParent(data.parent_id,id)
    : current.parent_id||null;

  if(parent_id&&await repo.hasChildren(id)){
    throw badRequest(
      'CATEGORY_DEPTH_LIMIT',
      'Kategori yang memiliki subkategori tidak dapat dijadikan subkategori.'
    );
  }

  return repo.update(id,{
    ...data,
    parent_id,
    slug:slug(data.slug||data.name||current.name)
  });
}

module.exports={list:repo.list,create,update};
