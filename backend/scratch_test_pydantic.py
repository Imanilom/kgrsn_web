from schemas import UserUpdate
from models import UserRole

data = {"username": "test", "role": "admin"}
update = UserUpdate(**data)

print(update.model_dump(exclude={"password"}, exclude_unset=True))
